package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/vouchrit/connector/internal/config"
	"github.com/vouchrit/connector/internal/tally"
)

type syncMastersRequest struct {
	OrganizationID       string              `json:"organizationId"`
	TallyCompanyRemoteId string              `json:"tallyCompanyRemoteId"`
	Masters              []tally.MasterEntry `json:"masters"`
}

type StatementEntry struct {
	Date        string  `json:"date"`
	Narration   string  `json:"narration"`
	Amount      float64 `json:"amount"`
	Type        string  `json:"type"`
	VoucherType string  `json:"voucher_type"`
	LedgerName  string  `json:"ledger_name"`
}

type ResolvedStatement struct {
	StatementID string           `json:"statement_id"`
	Entries     []StatementEntry `json:"entries"`
}

type mappedCompaniesResponse struct {
	MappedRemoteIds []string `json:"mappedRemoteIds"`
}

func GetMappedCompanies(ctx context.Context, cfg config.Config) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.APIBaseURL+"/api/connector/mapped-companies", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-connector-token", cfg.ConnectorToken)
	req.Header.Set("x-organization-id", cfg.ConnectorInstanceID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("mapped-companies api failed (%d)", resp.StatusCode)
	}

	var parsed mappedCompaniesResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	return parsed.MappedRemoteIds, nil
}

func PostMasters(ctx context.Context, cfg config.Config, tallyCompanyRemoteId string, masters []tally.MasterEntry) error {
	payload := syncMastersRequest{
		OrganizationID:       cfg.ConnectorInstanceID,
		TallyCompanyRemoteId: tallyCompanyRemoteId,
		Masters:              masters,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.APIBaseURL+"/api/connector/sync-masters", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-connector-token", cfg.ConnectorToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		data, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("sync-masters api failed (%d): %s", resp.StatusCode, string(data))
	}

	return nil
}

func FetchResolvedStatement(ctx context.Context, cfg config.Config, statementID string) (ResolvedStatement, error) {
	var payload ResolvedStatement

	url := fmt.Sprintf("%s/api/connector/statements/%s/resolved", cfg.APIBaseURL, statementID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return payload, err
	}
	req.Header.Set("x-connector-token", cfg.ConnectorToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return payload, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		data, _ := io.ReadAll(resp.Body)
		return payload, fmt.Errorf("fetch statement failed (%d): %s", resp.StatusCode, string(data))
	}

	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return payload, err
	}

	return payload, nil
}
type discoveryRequest struct {
	OrganizationID string                `json:"organizationId"`
	Companies      []tally.TallyCompany `json:"companies"`
}

func PostDiscovery(ctx context.Context, cfg config.Config, companies []tally.TallyCompany) error {
	payload := discoveryRequest{
		OrganizationID: cfg.ConnectorInstanceID, // We use InstanceID as a placeholder Org context if not set
		Companies:      companies,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.APIBaseURL+"/api/connector/discovery", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-connector-token", cfg.ConnectorToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		data, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("discovery api failed (%d): %s", resp.StatusCode, string(data))
	}

	return nil
}
