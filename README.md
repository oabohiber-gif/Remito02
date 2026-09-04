# Remito

Static deployment files:

- `index.html` — page structure
- `styles.css` — all visual styles
- `app.js` — calculator, settings, flags, and Google Finance rate logic

## GitHub Pages

Upload these three files to the root of the repository and enable GitHub Pages for the branch. Keep all three files in the same directory.

## Live-rate reliability

The app reads the Google Finance CAD/USD quote through multiple CORS readers in parallel, retries failures, stores the last successful quote in browser storage, refreshes every five minutes, and refreshes again when the browser reconnects or the tab becomes active. The calculator continues using the last successful rate if a live reader is temporarily unavailable.

## Automatically detected flags

When a country is added, the app resolves its ISO two-letter country code, displays its flag automatically, and saves the mapping in browser storage. Built-in browser country names are used first; Rest Countries is only used as a fallback. Existing embedded flags remain available offline, while newly added flags load from FlagCDN.

## eWire transaction desk

The **eWire Details** tab creates daily transaction records with automatic local date/time and references in the format `SETRF_YYMMDD-01`. Records stay in browser storage and can be copied to Google Sheets, downloaded as CSV, sent through a Google Apps Script Web App, and converted into agent WhatsApp messages.

Agents are managed by country in **Settings → Agent Directory**. Add each agent's WhatsApp number with international country code.

### Direct Google Sheets setup

1. Open the destination Google Sheet.
2. Select **Extensions → Apps Script**.
3. Paste the contents of `google-apps-script.gs` into `Code.gs` and save.
4. Choose **Deploy → New deployment → Web app**.
5. Set **Execute as** to yourself and **Who has access** to **Anyone**.
6. Copy the deployed `/exec` URL into the eWire tab and click **Save URL**.

The receiver creates an `eWire Transactions` sheet and prevents duplicate rows by record ID. Keep CSV/Copy for Sheets as an end-of-day backup.

### Agent and sender WhatsApp messages

Each transaction row has **Messages**, **Agent WA**, and **Sender WA** actions. **Messages** opens separate editable agent and sender templates. Changes are saved with the transaction and are included in CSV, Copy for Sheets, and direct Google Sheet exports. The updated Apps Script adds both message columns to the sheet.

### WhatsApp message privacy and format

Agent messages use the green **TRANSFER AUTHORIZATION** format with emoji sections. They include the amount the beneficiary must receive and the agent fee, but intentionally exclude both **Paid Amount (CAD)** and **Paid Amount (USD)** so the agent cannot see how much the sender paid. Sender confirmations use a separate emoji-based customer format and may include the sender's own paid amount.
