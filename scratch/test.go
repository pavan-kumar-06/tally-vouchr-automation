package main

import (
	"encoding/xml"
	"fmt"
)

type TallyCompany struct {
	Name     string `json:"name" xml:"NAME,attr"`
	GUID     string `json:"guid" xml:"GUID,attr"`
	RemoteID string `json:"remoteId" xml:"REMOTEID,attr"`
}

type companiesResponse struct {
	Companies []TallyCompany `xml:"BODY>DATA>COLLECTION>COMPANY"`
}

var data = []byte(`<ENVELOPE>
    <BODY>
        <DATA>
            <COLLECTION>
                <COMPANY NAME="Love Insurance Kompany" RESERVEDNAME="">    </COMPANY>
                <COMPANY NAME="Tally Test Company" RESERVEDNAME="">    </COMPANY>
            </COLLECTION>
        </DATA>
    </BODY>
</ENVELOPE>`)

func main() {
	var parsed companiesResponse
	err := xml.Unmarshal(data, &parsed)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	fmt.Printf("%+v\n", parsed)
}
