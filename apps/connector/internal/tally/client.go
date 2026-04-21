package tally

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
)

type MasterEntry struct {
	Name             string `json:"name"`
	Type             string `json:"type"`
	Parent           string `json:"parent,omitempty"`
	IsDeemedPositive *bool  `json:"isDeemedPositive,omitempty"`
}

const ledgersRequestXML = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>LedgerCollection</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVCURRENTCOMPANY>%s</SVCURRENTCOMPANY>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
                <TDLMESSAGE>
                    <COLLECTION NAME="LedgerCollection">
                        <TYPE>Ledger</TYPE>
                        <FETCH>NAME, PARENT, ISDEEMEDPOSITIVE, ISDELETED</FETCH>
                    </COLLECTION>
                </TDLMESSAGE>
            </TDL>
        </DESC>
    </BODY>
</ENVELOPE>`

const voucherTypesRequestXML = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>AllVoucherTypes</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVCURRENTCOMPANY>%s</SVCURRENTCOMPANY>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
                <TDLMESSAGE>
                    <COLLECTION NAME="AllVoucherTypes">
                        <TYPE>VoucherType</TYPE>
                        <FETCH>NAME, PARENT, NUMBERINGMETHOD, ISDELETED</FETCH>
                    </COLLECTION>
                </TDLMESSAGE>
            </TDL>
        </DESC>
    </BODY>
</ENVELOPE>`

type ledgersResponse struct {
	Ledgers []struct {
		Name             string `xml:"NAME,attr"`
		Parent           string `xml:"PARENT"`
		IsDeemedPositive string `xml:"ISDEEMEDPOSITIVE"`
		IsDeleted        string `xml:"ISDELETED"`
	} `xml:"BODY>DATA>COLLECTION>LEDGER"`
}

type vouchersResponse struct {
	VoucherTypes []struct {
		Name string `xml:"NAME,attr"`
	} `xml:"BODY>DATA>COLLECTION>VOUCHERTYPE"`
}

var invalidNumericEntityRe = regexp.MustCompile(`&#(?:0?[0-8]|1[0-9]|2[0-9]|30|31);`)

func decodeTallyXML(body io.Reader, into any) error {
	raw, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	// Tally sometimes emits invalid control-char entities like &#4;, which are not valid XML 1.0.
	// Remove those entities before decoding so we don't lose rows after the bad entity.
	sanitized := invalidNumericEntityRe.ReplaceAll(raw, []byte(""))
	return xml.Unmarshal(sanitized, into)
}

func FetchMasters(ctx context.Context, tallyBaseURL, companyName string) ([]MasterEntry, error) {
	masters := make([]MasterEntry, 0)

	// Fetch Ledgers
	reqLedgers, _ := http.NewRequestWithContext(ctx, http.MethodPost, tallyBaseURL, bytes.NewBufferString(fmt.Sprintf(ledgersRequestXML, companyName)))
	reqLedgers.Header.Set("content-type", "application/xml")
	respL, err := http.DefaultClient.Do(reqLedgers)
	if err == nil && respL.StatusCode < 300 {
		var parsedL ledgersResponse
		if err := decodeTallyXML(respL.Body, &parsedL); err != nil {
			respL.Body.Close()
			return nil, fmt.Errorf("failed to decode ledger XML: %w", err)
		}
		respL.Body.Close()
		for _, l := range parsedL.Ledgers {
			name := strings.TrimSpace(l.Name)
			if name != "" && !isLogicalYes(l.IsDeleted) {
				parent := strings.TrimSpace(l.Parent)
				masters = append(masters, MasterEntry{
					Name:             name,
					Type:             "LEDGER",
					Parent:           parent,
					IsDeemedPositive: parseLogicalBoolPtr(l.IsDeemedPositive),
				})
			}
		}
	}

	// Fetch Voucher Types
	reqVouchers, _ := http.NewRequestWithContext(ctx, http.MethodPost, tallyBaseURL, bytes.NewBufferString(fmt.Sprintf(voucherTypesRequestXML, companyName)))
	reqVouchers.Header.Set("content-type", "application/xml")
	respV, err := http.DefaultClient.Do(reqVouchers)
	if err == nil && respV.StatusCode < 300 {
		var parsedV vouchersResponse
		if err := decodeTallyXML(respV.Body, &parsedV); err != nil {
			respV.Body.Close()
			return nil, fmt.Errorf("failed to decode voucher-type XML: %w", err)
		}
		respV.Body.Close()
		for _, v := range parsedV.VoucherTypes {
			if v.Name != "" {
				masters = append(masters, MasterEntry{Name: v.Name, Type: "VOUCHER_TYPE"})
			}
		}
	}

	return masters, nil
}

func parseLogicalBoolPtr(v string) *bool {
	normalized := strings.ToUpper(strings.TrimSpace(v))
	switch normalized {
	case "YES":
		t := true
		return &t
	case "NO":
		f := false
		return &f
	default:
		return nil
	}
}

func isLogicalYes(v string) bool {
	return strings.ToUpper(strings.TrimSpace(v)) == "YES"
}

func PushVouchers(ctx context.Context, tallyBaseURL, voucherXML string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tallyBaseURL, bytes.NewBufferString(voucherXML))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/xml")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		data, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("tally voucher push failed (%d): %s", resp.StatusCode, string(data))
	}

	return nil
}
type TallyCompany struct {
	Name     string `json:"name" xml:"NAME,attr"`
	GUID     string `json:"guid" xml:"GUID,attr"`
	RemoteID string `json:"remoteId" xml:"REMOTEID,attr"`
}

const companiesRequestXML = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>List of Companies</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
        </DESC>
    </BODY>
</ENVELOPE>`

type companiesResponse struct {
	Companies []TallyCompany `xml:"BODY>DATA>COLLECTION>COMPANY"`
}

func FetchCompanies(ctx context.Context, tallyBaseURL string) ([]TallyCompany, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tallyBaseURL, bytes.NewBufferString(companiesRequestXML))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/xml")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("tally companies request failed (%d)", resp.StatusCode)
	}

	var parsed companiesResponse
	if err := xml.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return []TallyCompany{}, nil
	}

	if parsed.Companies == nil {
		return []TallyCompany{}, nil
	}
	// Filter empty names and map RemoteID
	var validCompanies []TallyCompany
	for _, c := range parsed.Companies {
		name := strings.TrimSpace(c.Name)
		if name == "" {
			continue
		}
		c.Name = name
		if c.RemoteID == "" {
			c.RemoteID = c.Name
		}
		validCompanies = append(validCompanies, c)
	}

	return validCompanies, nil
}
