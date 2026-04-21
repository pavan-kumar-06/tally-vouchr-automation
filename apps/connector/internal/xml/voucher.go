package xml

import (
	"fmt"
	"strings"

	"github.com/vouchrit/connector/internal/api"
)

func BuildVoucherEnvelope(companyName, bankLedgerName string, entries []api.StatementEntry) (string, error) {
	if len(entries) == 0 {
		return "", fmt.Errorf("no entries to export")
	}

	var builder strings.Builder
	builder.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	builder.WriteString("<ENVELOPE>\n")
	builder.WriteString("  <HEADER>\n")
	builder.WriteString("    <TALLYREQUEST>Import Data</TALLYREQUEST>\n")
	builder.WriteString("  </HEADER>\n")
	builder.WriteString("  <BODY>\n")
	builder.WriteString("    <IMPORTDATA>\n")
	builder.WriteString("      <REQUESTDESC>\n")
	builder.WriteString("        <REPORTNAME>Vouchers</REPORTNAME>\n")
	builder.WriteString("        <STATICVARIABLES>\n")
	builder.WriteString(fmt.Sprintf("          <SVCURRENTCOMPANY>%s</SVCURRENTCOMPANY>\n", escapeXML(companyName)))
	builder.WriteString("        </STATICVARIABLES>\n")
	builder.WriteString("      </REQUESTDESC>\n")
	builder.WriteString("      <REQUESTDATA>\n")

	for idx, entry := range entries {
		voucherType := strings.Title(strings.ToLower(entry.VoucherType))
		if voucherType == "" {
			voucherType = "Payment"
		}
		ledger := entry.LedgerName
		if ledger == "" {
			ledger = "Suspense A/c"
		}

		// Tally date format: YYYYMMDD
		dateStr := strings.ReplaceAll(entry.Date, "-", "")
		isDebitInStatement := strings.ToUpper(entry.Type) == "DEBIT"
		
		// TALLY SIGN CONVENTION:
		// DEBIT: ISDEEMEDPOSITIVE = Yes, AMOUNT = -ve
		// CREDIT: ISDEEMEDPOSITIVE = No, AMOUNT = +ve
		// DEBIT (Money OUT): Bank is CREDITED (+ve), Party is DEBITED (-ve)
		// CREDIT (Money IN): Bank is DEBITED (-ve), Party is CREDITED (+ve)

		bankIsDeemedPositive := "Yes"
		bankAmount := -entry.Amount
		partyIsDeemedPositive := "No"
		partyAmount := entry.Amount

		if isDebitInStatement {
			bankIsDeemedPositive = "No"
			bankAmount = entry.Amount
			partyIsDeemedPositive = "Yes"
			partyAmount = -entry.Amount
		}

		vchNum := fmt.Sprintf("TX%04d", idx+1)
		transactionType := "Others"

		builder.WriteString("        <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">\n")
		builder.WriteString(fmt.Sprintf("          <VOUCHER VCHTYPE=\"%s\" ACTION=\"Create\" OBJVIEW=\"Accounting Voucher View\">\n", escapeXML(voucherType)))
		builder.WriteString(fmt.Sprintf("            <DATE>%s</DATE>\n", dateStr))
		builder.WriteString(fmt.Sprintf("            <VOUCHERTYPENAME>%s</VOUCHERTYPENAME>\n", escapeXML(voucherType)))
		builder.WriteString(fmt.Sprintf("            <VOUCHERNUMBER>%s</VOUCHERNUMBER>\n", escapeXML(vchNum)))
		builder.WriteString(fmt.Sprintf("            <PARTYLEDGERNAME>%s</PARTYLEDGERNAME>\n", escapeXML(bankLedgerName)))
		builder.WriteString(fmt.Sprintf("            <NARRATION>%s</NARRATION>\n", escapeXML(entry.Narration)))
		builder.WriteString(fmt.Sprintf("            <EFFECTIVEDATE>%s</EFFECTIVEDATE>\n", dateStr))
		
		// Party Entry
		builder.WriteString("            <ALLLEDGERENTRIES.LIST>\n")
		builder.WriteString(fmt.Sprintf("              <LEDGERNAME>%s</LEDGERNAME>\n", escapeXML(ledger)))
		builder.WriteString(fmt.Sprintf("              <ISDEEMEDPOSITIVE>%s</ISDEEMEDPOSITIVE>\n", partyIsDeemedPositive))
		builder.WriteString("              <ISPARTYLEDGER>No</ISPARTYLEDGER>\n")
		builder.WriteString(fmt.Sprintf("              <AMOUNT>%.2f</AMOUNT>\n", partyAmount))
		builder.WriteString("            </ALLLEDGERENTRIES.LIST>\n")

		// Bank Entry
		builder.WriteString("            <ALLLEDGERENTRIES.LIST>\n")
		builder.WriteString(fmt.Sprintf("              <LEDGERNAME>%s</LEDGERNAME>\n", escapeXML(bankLedgerName)))
		builder.WriteString(fmt.Sprintf("              <ISDEEMEDPOSITIVE>%s</ISDEEMEDPOSITIVE>\n", bankIsDeemedPositive))
		builder.WriteString("              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n")
		builder.WriteString(fmt.Sprintf("              <AMOUNT>%.2f</AMOUNT>\n", bankAmount))
		builder.WriteString("              <BANKALLOCATIONS.LIST>\n")
		builder.WriteString(fmt.Sprintf("                <DATE>%s</DATE>\n", dateStr))
		builder.WriteString(fmt.Sprintf("                <INSTRUMENTDATE>%s</INSTRUMENTDATE>\n", dateStr))
		builder.WriteString(fmt.Sprintf("                <TRANSACTIONTYPE>%s</TRANSACTIONTYPE>\n", transactionType))
		builder.WriteString(fmt.Sprintf("                <PAYMENTFAVOURING>%s</PAYMENTFAVOURING>\n", escapeXML(ledger)))
		builder.WriteString(fmt.Sprintf("                <AMOUNT>%.2f</AMOUNT>\n", bankAmount))
		builder.WriteString("              </BANKALLOCATIONS.LIST>\n")
		builder.WriteString("            </ALLLEDGERENTRIES.LIST>\n")
		
		builder.WriteString("          </VOUCHER>\n")
		builder.WriteString("        </TALLYMESSAGE>\n")
	}

	builder.WriteString("      </REQUESTDATA>\n")
	builder.WriteString("    </IMPORTDATA>\n")
	builder.WriteString("  </BODY>\n")
	builder.WriteString("</ENVELOPE>")
	return builder.String(), nil
}

func escapeXML(value string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&apos;",
	)
	return replacer.Replace(value)
}
