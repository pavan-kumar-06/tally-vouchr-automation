package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/vouchrit/connector/internal/api"
	"github.com/vouchrit/connector/internal/config"
	"github.com/vouchrit/connector/internal/tally"
)

var (
	isSyncing = false
	lastSync  = "Never"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: vouchr-connector <sync-masters|push-vouchers|serve> [flags]")
		os.Exit(1)
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("config error: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()

	switch os.Args[1] {
	case "sync-masters":
		if err := runSyncMasters(ctx, cfg, ""); err != nil {
			fmt.Printf("sync-masters failed: %v\n", err)
			os.Exit(1)
		}
	case "sync-discovery":
		if err := runSyncDiscovery(ctx, cfg); err != nil {
			fmt.Printf("sync-discovery failed: %v\n", err)
			os.Exit(1)
		}
	case "serve":
		runServer(ctx, cfg)
	default:
		fmt.Printf("unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}

func runServer(ctx context.Context, cfg config.Config) {
	// CORS helper
	enableCors := func(w http.ResponseWriter) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	}

	// 1. Start Local API for frontend to pull companies directly
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

		// Format mapping for Vouchr frontend
		type parsedCompany struct {
			Id                   string `json:"id"`
			TallyCompanyName     string `json:"tallyCompanyName"`
			TallyCompanyRemoteId string `json:"tallyCompanyRemoteId"`
		}

		var result []parsedCompany
		for _, c := range companies {
			result = append(result, parsedCompany{
				Id:                   c.RemoteID,
				TallyCompanyName:     c.Name,
				TallyCompanyRemoteId: c.RemoteID,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	// 2. Start Local Status API (for the Desktop GUI)
	http.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		enableCors(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"is_syncing": isSyncing,
			"last_sync":  lastSync,
			"company_id": cfg.CompanyID,
			"tally_url":  cfg.TallyBaseURL,
		})
	})

	http.HandleFunc("/sync-now", func(w http.ResponseWriter, r *http.Request) {
		enableCors(w)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		var reqBody struct {
			TallyCompanyRemoteId string `json:"tallyCompanyRemoteId"`
		}
		if r.Body != nil {
			json.NewDecoder(r.Body).Decode(&reqBody)
		}

		go runSyncMasters(ctx, cfg, reqBody.TallyCompanyRemoteId)
		w.WriteHeader(http.StatusAccepted)
	})

	fmt.Println("Vouchrit Tally Connector server started on port 15000")
	log.Fatal(http.ListenAndServe(":15000", nil))
}

func runSyncDiscovery(ctx context.Context, cfg config.Config) error {
	companies, err := tally.FetchCompanies(ctx, cfg.TallyBaseURL)
	if err != nil {
		return err
	}
	return api.PostDiscovery(ctx, cfg, companies)
}

func runSyncMasters(ctx context.Context, cfg config.Config, specificRemoteId string) error {
	log.Printf("[sync] Starting master sync (specificId: %q)", specificRemoteId)

	companies, err := tally.FetchCompanies(ctx, cfg.TallyBaseURL)
	if err != nil {
		return fmt.Errorf("failed to fetch companies: %v", err)
	}
	log.Printf("[sync] Tally returned %d companies", len(companies))

	mappedRemoteIds, err := api.GetMappedCompanies(ctx, cfg)
	if err != nil {
		return fmt.Errorf("failed to get mapped companies: %v", err)
	}
	log.Printf("[sync] Mapped companies from Vouchr BE: %v", mappedRemoteIds)

	mappedSet := make(map[string]bool)
	for _, id := range mappedRemoteIds {
		mappedSet[id] = true
	}

	for _, company := range companies {
		bestId := company.RemoteID
		if bestId == "" {
			bestId = company.GUID
		}
		if bestId == "" {
			bestId = company.Name
		}

		log.Printf("[sync] Checking company %q (id: %q)", company.Name, bestId)

		// If a specific remote ID was requested, skip others
		if specificRemoteId != "" && bestId != specificRemoteId {
			log.Printf("[sync]   Skipping (not the target)")
			continue
		}

		// Skip if not mapped
		if !mappedSet[bestId] {
			log.Printf("[sync]   Skipping (not mapped in Vouchr)")
			continue
		}

		log.Printf("[sync]   Fetching masters from Tally for %q...", company.Name)
		masters, err := tally.FetchMasters(ctx, cfg.TallyBaseURL, company.Name)
		if err != nil {
			log.Printf("[sync]   ERROR fetching masters: %v", err)
			continue
		}
		log.Printf("[sync]   Got %d masters (ledgers + voucher types)", len(masters))
		ledgerCount := 0
		ledgerWithParentCount := 0
		for _, m := range masters {
			if m.Type == "LEDGER" {
				ledgerCount++
				if m.Parent != "" {
					ledgerWithParentCount++
				}
			}
		}
		log.Printf("[sync]   Ledger parent coverage: %d/%d ledgers have parent", ledgerWithParentCount, ledgerCount)

		err = api.PostMasters(ctx, cfg, bestId, masters)
		if err != nil {
			log.Printf("[sync]   ERROR posting masters to Vouchr BE: %v", err)
		} else {
			log.Printf("[sync]   Successfully posted %d masters for %q", len(masters), company.Name)
		}
	}
	log.Printf("[sync] Done.")
	return nil
}
