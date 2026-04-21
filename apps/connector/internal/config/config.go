package config

import (
	"bufio"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	APIBaseURL          string
	ConnectorToken      string
	CompanyID           string
	TallyBaseURL        string
	ConnectorInstanceID string
}

func Load() (Config, error) {
	loadDotEnv()

	cfg := Config{
		APIBaseURL:          getEnv("VOUCHR_API_BASE_URL", "http://localhost:3000"),
		ConnectorToken:      os.Getenv("VOUCHR_CONNECTOR_TOKEN"),
		CompanyID:           os.Getenv("VOUCHR_COMPANY_ID"),
		TallyBaseURL:        getEnv("TALLY_BASE_URL", "http://localhost:9000"),
		ConnectorInstanceID: getEnv("CONNECTOR_INSTANCE_ID", "desktop-local"),
	}

	if cfg.ConnectorToken == "" {
		return cfg, errors.New("VOUCHR_CONNECTOR_TOKEN is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func loadDotEnv() {
	candidates := []string{".env.local", ".env"}

	for _, name := range candidates {
		path := filepath.Clean(name)
		file, err := os.Open(path)
		if err != nil {
			continue
		}

		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}

			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}

			key := strings.TrimSpace(parts[0])
			value := strings.Trim(strings.TrimSpace(parts[1]), "\"")
			if key == "" {
				continue
			}

			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, value)
			}
		}

		_ = file.Close()
	}
}
