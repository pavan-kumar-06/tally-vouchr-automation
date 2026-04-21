package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/vouchrit/connector/internal/api"
	"github.com/vouchrit/connector/internal/config"
	"github.com/vouchrit/connector/internal/tally"
)

var (
	isSyncing = false
	lastSync  = "Never"
	workerURL = ""
	apiURL    = ""
	token     = ""
)

// connectSSE subscribes to the Vouchr BE for sync commands.
// When BE pushes a command, connector executes and POSTs result back.
func connectSSE(ctx context.Context, orgID, connectorInstanceID string) error {
	url := workerURL + "/v1/connector/events"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("SSE request creation failed: %w", err)
	}
	req.Header.Set("x-connector-token", token)
	req.Header.Set("x-connector-id", connectorInstanceID)
	req.Header.Set("x-org-id", orgID)

	log.Printf("[SSE] Connecting to %s (org_id=%s)", url, orgID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("SSE connection failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("SSE returned %d: %s", resp.StatusCode, string(body))
	}

	log.Printf("[SSE] Connected. Listening for events...")
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if len(line) < 6 || line[:6] != "data: " {
			continue
		}
		payload := line[6:]

		var event struct {
			Type          string `json:"type"`
			SyncID        string `json:"sync_id"`
			CompanyID     string `json:"company_id"`
			TallyRemoteID string `json:"tally_remote_id"`
			ConnectorID   string `json:"connector_id"`
		}
		if err := json.Unmarshal([]byte(payload), &event); err != nil {
			log.Printf("[SSE] Failed to parse event: %v", err)
			continue
		}

		log.Printf("[SSE] Event: type=%s, sync_id=%s", event.Type, event.SyncID)

		switch event.Type {
		case "CONNECTED":
			log.Printf("[SSE] Handshake confirmed, connector_id=%s", event.ConnectorID)
			// Auto-discover companies on connect
			go func() {
				log.Printf("[SSE] Auto-discovering companies after connect...")
				if err := doDiscoverCompanies(ctx); err != nil {
					log.Printf("[SSE] Auto-discover failed: %v", err)
				} else {
					log.Printf("[SSE] Auto-discover completed")
				}
			}()

		case "DISCOVER_COMPANIES":
			log.Printf("[SSE] DISCOVER_COMPANIES event received")
			if err := doDiscoverCompanies(ctx); err != nil {
				log.Printf("[DISCOVER] Failed: %v", err)
			}

		case "SYNC_MASTERS":
			log.Printf("[SSE] SYNC_MASTERS for company=%s, tally_id=%s", event.CompanyID, event.TallyRemoteID)
			isSyncing = true
			result, err := doSyncMasters(ctx, event.CompanyID, event.TallyRemoteID)
			isSyncing = false

			success := err == nil
			errMsg := ""
			if err != nil {
				errMsg = err.Error()
			}

			// Report back to BE
			bodyBytes, _ := json.Marshal(map[string]interface{}{
				"sync_id": event.SyncID,
				"success": success,
				"result":  result,
				"error":   errMsg,
			})
			completeURL := workerURL + "/v1/connector/complete"
			compReq, _ := http.NewRequestWithContext(ctx, http.MethodPost, completeURL, bytes.NewReader(bodyBytes))
			compReq.Header.Set("x-connector-token", token)
			compReq.Header.Set("Content-Type", "application/json")
			http.DefaultClient.Do(compReq)

		case "HEARTBEAT":
			// keep alive

		default:
			log.Printf("[SSE] Unknown event: %s", event.Type)
		}
	}

	return scanner.Err()
}

func doSyncMasters(ctx context.Context, companyID, tallyRemoteID string) (map[string]any, error) {
	TallyBaseURL := os.Getenv("TALLY_BASE_URL")
	if TallyBaseURL == "" {
		TallyBaseURL = "http://localhost:9000"
	}

	log.Printf("[sync] Fetching ledgers from Tally (company=%s)", tallyRemoteID)
	ledgers, err := tally.FetchLedgers(ctx, TallyBaseURL, tallyRemoteID)
	if err != nil {
		log.Printf("[sync] Failed to fetch ledgers: %v", err)
	} else {
		log.Printf("[sync] Got %d ledgers from Tally", len(ledgers))
	}

	log.Printf("[sync] Fetching voucher types from Tally (company=%s)", tallyRemoteID)
	voucherTypes, err := tally.FetchVoucherTypes(ctx, TallyBaseURL, tallyRemoteID)
	if err != nil {
		log.Printf("[sync] Failed to fetch voucher types: %v", err)
	} else {
		log.Printf("[sync] Got %d voucher types from Tally", len(voucherTypes))
	}

	allMasters := append(ledgers, voucherTypes...)
	log.Printf("[sync] Total masters: %d", len(allMasters))

	cfg := config.Config{
		APIBaseURL:          apiURL,
		ConnectorToken:     token,
		ConnectorInstanceID: companyID,
	}

	log.Printf("[sync] Posting %d masters to Vouchr BE at %s", len(allMasters), apiURL)
	if err := api.PostMasters(ctx, cfg, tallyRemoteID, allMasters); err != nil {
		log.Printf("[sync] PostMasters failed: %v", err)
		return nil, fmt.Errorf("post masters failed: %w", err)
	}

	lastSync = time.Now().Format(time.RFC3339)
	return map[string]any{"ledgers": len(ledgers), "voucher_types": len(voucherTypes)}, nil
}

func doDiscoverCompanies(ctx context.Context) error {
	TallyBaseURL := os.Getenv("TALLY_BASE_URL")
	if TallyBaseURL == "" {
		TallyBaseURL = "http://localhost:9000"
	}

	log.Printf("[discover] Fetching companies from Tally at %s", TallyBaseURL)
	companies, err := tally.FetchCompanies(ctx, TallyBaseURL)
	if err != nil {
		log.Printf("[discover] FetchCompanies failed: %v", err)
		return fmt.Errorf("fetch companies failed: %w", err)
	}
	log.Printf("[discover] Found %d companies in Tally", len(companies))

	if len(companies) == 0 {
		return nil
	}

	cfg := config.Config{
		APIBaseURL:          apiURL,
		ConnectorToken:     token,
		ConnectorInstanceID: os.Getenv("VOUCHR_ORG_ID"),
	}

	log.Printf("[discover] Posting %d companies to Vouchr BE", len(companies))
	if err := api.PostDiscovery(ctx, cfg, companies); err != nil {
		log.Printf("[discover] PostDiscovery failed: %v", err)
		return fmt.Errorf("post discovery failed: %w", err)
	}

	log.Printf("[discover] Successfully posted companies to Vouchr BE")
	return nil
}

func runSSEClient(ctx context.Context) {
	orgID := os.Getenv("VOUCHR_ORG_ID")
	if orgID == "" {
		orgID = "default-org"
	}
	connectorInstanceID := os.Getenv("CONNECTOR_INSTANCE_ID")
	if connectorInstanceID == "" {
		connectorInstanceID = "local-connector"
	}

	for {
		select {
		case <-ctx.Done():
			log.Println("[SSE] Context cancelled, stopping")
			return
		default:
			if err := connectSSE(ctx, orgID, connectorInstanceID); err != nil {
				log.Printf("[SSE] Disconnected: %v. Reconnecting in 5s...", err)
				time.Sleep(5 * time.Second)
			}
		}
	}
}

// ── Local HTTP server for FE discovery ─────────────────────────────────────

func runServer(ctx context.Context, cfg config.Config) {
	workerURL = os.Getenv("VOUCHR_WORKER_URL")
	if workerURL == "" {
		workerURL = "http://localhost:8000"
	}
	apiURL = os.Getenv("VOUCHR_API_BASE_URL")
	if apiURL == "" {
		apiURL = "http://localhost:3000"
	}
	token = cfg.ConnectorToken

	go runSSEClient(ctx)

	enableCors := func(w http.ResponseWriter) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	}

	http.HandleFunc("/companies", func(w http.ResponseWriter, r *http.Request) {
		enableCors(w)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		companies, err := tally.FetchCompanies(ctx, cfg.TallyBaseURL)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		type pc struct {
			Id                   string `json:"id"`
			TallyCompanyName     string `json:"tallyCompanyName"`
			TallyCompanyRemoteId string `json:"tallyCompanyRemoteId"`
		}
		var result []pc
		for _, c := range companies {
			result = append(result, pc{Id: c.RemoteID, TallyCompanyName: c.Name, TallyCompanyRemoteId: c.RemoteID})
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	http.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		enableCors(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"is_syncing":       isSyncing,
			"last_sync":        lastSync,
			"org_id":           os.Getenv("VOUCHR_ORG_ID"),
			"sse_connected_to": workerURL,
			"api_url":           apiURL,
		})
	})

	fmt.Printf("Vouchrit Connector started\n")
	fmt.Printf("  SSE  → %s\n", workerURL)
	fmt.Printf("  API  → %s\n", apiURL)
	fmt.Printf("  Tally → %s\n", cfg.TallyBaseURL)
	log.Fatal(http.ListenAndServe(":15000", nil))
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: vouchr-connector <serve>")
		os.Exit(1)
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("config error: %v\n", err)
		os.Exit(1)
	}

	if os.Args[1] == "serve" {
		runServer(context.Background(), cfg)
	} else {
		fmt.Printf("unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}
