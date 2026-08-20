/* Remito — application logic
   Pricing, calculations, settings, flags, live-rate retrieval, and UI behavior. */

// --- Data Model ---
        const DEFAULT_SYRIA_RATES = {
            lastUpdated: "",
            cities: {
                "دمشق( مرجة )": { usdSyp: 129.50, cadSyp: 86.30 },
                "دمشق ( سمان )": { usdSyp: 129.50, cadSyp: 86.30 },
                "حلب": { usdSyp: 129.50, cadSyp: 86.30 },
                "حماة": { usdSyp: 129.50, cadSyp: 86.30 },
                "حمص": { usdSyp: 129.00, cadSyp: 86.00 },
                "درعا": { usdSyp: 129.00, cadSyp: 86.00 },
                "اللاذقية": { usdSyp: 129.00, cadSyp: 86.00 },
                "طرطوس": { usdSyp: 129.00, cadSyp: 86.00 },
                "الهرم": { usdSyp: 128.50, cadSyp: 85.70 },
                "شام كاش": { usdSyp: 128.50, cadSyp: 85.70 }
            }
        };

        let SYRIA_RATES = null;
        try {
            const stored = localStorage.getItem('syria_rates');
            if (stored) SYRIA_RATES = JSON.parse(stored);
        } catch(e) {}
        if (!SYRIA_RATES) {
            SYRIA_RATES = JSON.parse(JSON.stringify(DEFAULT_SYRIA_RATES));
        }

        const DEFAULT_PRICING = {
            "Syria": {
                tiers: [{ max: 400, add: 15 }, { max: 700, add: 20 }],
                pctRate: 0.03, usdPayPct: 0.04,
                fees: [{ max: 300, amount: 5 }, { max: 999, amount: 7 }],
                feePct: 0.007
            },
            "Lebanon": {
                tiers: [{ max: 650, add: 20 }],
                pctRate: 0.03, usdPayPct: 0.04,
                fees: [{ max: 2500, amount: 5 }],
                feePct: 0.002
            },
            "Lebanon OMT": {
                tiers: [{ max: 700, add: 25 }],
                pctRate: 0.035, usdPayPct: 0.045,
                fees: [{ max: 300, amount: 5 }, { max: 999, amount: 7 }, { max: 1500, amount: 10 }, { max: 2000, amount: 12 }],
                feePct: 0.007
            },
            "Gazah": {
                tiers: [{ max: 800, add: 20 }],
                pctRate: 0.025, usdPayPct: 0.035,
                fees: [{ max: 1000, amount: 7 }],
                feePct: 0.007
            },
            "Dafeh": {
                tiers: [{ max: 650, add: 20 }],
                pctRate: 0.03, usdPayPct: 0.04,
                fees: [{ max: 2500, amount: 10 }],
                feePct: 0.004
            },
            "Turkey": {
                tiers: [{ max: 800, add: 20 }],
                pctRate: 0.025, usdPayPct: 0.035,
                fees: [{ max: 2500, amount: 5 }],
                feePct: 0.002
            },
            "Iraq": {
                tiers: [{ max: 800, add: 20 }],
                pctRate: 0.025, usdPayPct: 0.035,
                fees: [{ max: 2500, amount: 5 }],
                feePct: 0.002
            },
            "Egypt": {
                tiers: [{ max: 500, add: 20 }],
                pctRate: 0.04, usdPayPct: 0.05,
                fees: [{ max: 1000, amount: 7 }],
                feePct: 0.007
            },
            "Jordan": {
                jodRate: 1.4135,
                threshold: 630,
                flatFee: 20,
                pctFee: 0.03,
                tiers: [],
                pctRate: 0,
                usdPayPct: 0,
                fees: [{ max: 2500, amount: 5 }],
                feePct: 0.002
            }
        };

        let PRICING = null;
        try {
            const stored = localStorage.getItem('fx_pricing');
            if (stored) PRICING = JSON.parse(stored);
        } catch(e) {}
        if (!PRICING) {
            PRICING = JSON.parse(JSON.stringify(DEFAULT_PRICING));
        }
        // Migration safety: a browser that cached fx_pricing before Jordan had its
        // own configuration fields would otherwise still be missing them.
        if (!PRICING['Jordan'] || typeof PRICING['Jordan'].jodRate !== 'number') {
            PRICING['Jordan'] = JSON.parse(JSON.stringify(DEFAULT_PRICING['Jordan']));
            try { localStorage.setItem('fx_pricing', JSON.stringify(PRICING)); } catch(e) {}
        }

        // --- Math Functions ---
        function collectCAD(country, usdAmount, rate) {
            let p = PRICING[country];
            if (!p) return null;
            for (let tier of p.tiers) {
                if (usdAmount <= tier.max) {
                    return { val: rate * (usdAmount + tier.add), note: null };
                }
            }
            return { val: rate * usdAmount * (1 + p.pctRate), note: null };
        }

        function collectUSD(country, usdAmount) {
            let p = PRICING[country];
            if (!p) return null;
            for (let tier of p.tiers) {
                if (usdAmount <= tier.max) {
                    return { val: usdAmount + tier.add, note: "Fixed-fee tier — no surcharge applied" };
                }
            }
            return { val: usdAmount * (1 + p.usdPayPct), note: "+1% surcharge applied on percentage tier" };
        }

        function agentFeeUSD(country, usdAmount) {
            let p = PRICING[country];
            if (!p) return null;
            for (let feeTier of p.fees) {
                if (usdAmount <= feeTier.max) return feeTier.amount;
            }
            return usdAmount * p.feePct;
        }

        function reverseUSD(country, cadAmount, rate) {
            let p = PRICING[country];
            if (!p) return null;
            let prevMax = -Infinity;
            // Test fixed tiers algebraically
            for (let tier of p.tiers) {
                let candidate = (cadAmount / rate) - tier.add;
                if (candidate > prevMax && candidate <= tier.max) {
                    return candidate;
                }
                prevMax = tier.max;
            }
            // Test percentage tier
            let candidate = cadAmount / (rate * (1 + p.pctRate));
            if (candidate > prevMax) return candidate;
            
            return null; // Unsolvable
        }

        // Reverse of collectUSD() — given what the customer paid in USD, solve for the
        // beneficiary amount. Same tier-boundary-testing approach as reverseUSD(), just
        // without a rate conversion since both sides are already in USD.
        function reverseUSDPayment(country, usdPaid) {
            let p = PRICING[country];
            if (!p) return null;
            let prevMax = -Infinity;
            for (let tier of p.tiers) {
                let candidate = usdPaid - tier.add;
                if (candidate > prevMax && candidate <= tier.max) {
                    return { val: candidate, note: "Fixed-fee tier — no surcharge applied" };
                }
                prevMax = tier.max;
            }
            let candidate = usdPaid / (1 + p.usdPayPct);
            if (candidate > prevMax) {
                return { val: candidate, note: "+1% surcharge applied on percentage tier" };
            }
            return null; // Unsolvable
        }

        // --- Formatting & UI Helpers ---
        // Round normally to the nearest cent. This replaces the previous Math.ceil()
        // behavior, which always increased amounts to the next whole unit.
        function roundToTwo(amount) {
            return Math.round((amount + Number.EPSILON) * 100) / 100;
        }

        function formatMoney(amount, currencyCode) {
            const fractionDigits = 2;
            return currencyCode + ' ' + amount.toLocaleString('en-CA', { 
                minimumFractionDigits: fractionDigits, 
                maximumFractionDigits: fractionDigits 
            });
        }

        function triggerAnim(el) {
            el.classList.remove('anim-trigger');
            void el.offsetWidth; // force reflow
            el.classList.add('anim-trigger');
        }

        // --- Global State ---
        let currentMode = 1;
        let sendCurrency = 'CAD';   // 'CAD' or 'USD' — which currency the customer is paying in
        let receiveCurrency = 'USD';
        let lastEditedField = 'recipient';

        // Only expose currencies supported by the existing pricing formulas.
        // Syria supports USD/SYP, Jordan supports JOD, and all other corridors receive USD.
        const RECEIVE_CURRENCIES = {
            Syria: ['USD', 'SYP'],
            Jordan: ['JOD']
        };
        const RECEIVE_CURRENCY_FLAGS = { USD: 'us', SYP: 'sy', JOD: 'jo' };
        function getReceiveCurrencies(country) {
            return RECEIVE_CURRENCIES[country] || ['USD'];
        }
        function renderReceiveCurrencyOptions(country) {
            const chip = document.getElementById('amount-currency-chip');
            const menu = document.getElementById('amount-currency-menu');
            if (!chip || !menu) return;
            const supported = getReceiveCurrencies(country);
            if (!supported.includes(receiveCurrency)) receiveCurrency = supported[0];

            chip.innerHTML = `${flagImage(RECEIVE_CURRENCY_FLAGS[receiveCurrency], receiveCurrency + ' flag')} ${receiveCurrency}`;
            menu.innerHTML = supported.map(currency => {
                const selected = currency === receiveCurrency;
                return `<button type="button" class="currency-chip-option${selected ? ' selected' : ''}" data-cur="${currency}" onclick="setReceiveCurrency('${currency}')">${flagImage(RECEIVE_CURRENCY_FLAGS[currency], currency + ' flag')} ${currency}</button>`;
            }).join('');
        }

        function toggleCurrencyChipMenu(type, event) {
            if (event) event.stopPropagation();
            const menu = document.getElementById(`${type}-currency-menu`);
            const button = document.getElementById(`${type}-currency-chip`);
            if (!menu || !button) return;
            const willOpen = !menu.classList.contains('open');
            document.querySelectorAll('.currency-chip-menu.open').forEach(openMenu => openMenu.classList.remove('open'));
            document.querySelectorAll('.currency-chip-button[aria-expanded="true"]').forEach(openButton => openButton.setAttribute('aria-expanded', 'false'));
            menu.classList.toggle('open', willOpen);
            button.setAttribute('aria-expanded', String(willOpen));
        }

        function closeCurrencyChipMenus() {
            document.querySelectorAll('.currency-chip-menu.open').forEach(menu => menu.classList.remove('open'));
            document.querySelectorAll('.currency-chip-button[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
        }

        // Mode 3 = USD forward (recipient box drives the calc), mode 5 = USD reverse
        // (send box drives it) — both now have real math via collectUSD()/reverseUSDPayment().
        function determineMode() {
            if (sendCurrency === 'USD') {
                return (lastEditedField === 'send') ? 5 : 3;
            }
            return (lastEditedField === 'send') ? 2 : 1;
        }

        function setSendCurrency(cur) {
            sendCurrency = cur;
            document.querySelectorAll('#send-currency-menu .currency-chip-option').forEach(option => {
                option.classList.toggle('selected', option.dataset.cur === cur);
            });
            document.getElementById('send-currency-chip').innerHTML = `${flagImage(cur === 'CAD' ? 'ca' : 'us', cur + ' flag')} ${cur}`;
            closeCurrencyChipMenus();

            const sendInput = document.getElementById('send-input');
            const sendLabel = document.getElementById('send-label');
            const rateContainer = document.getElementById('rate-container');
            const rateInput = document.getElementById('rate-input');

            if (cur === 'USD') {
                sendInput.placeholder = '0.00';
                sendLabel.innerText = 'You Send (USD)';
                rateContainer.style.opacity = '0.4';
                rateInput.disabled = true;
            } else {
                sendInput.placeholder = '0.00';
                sendLabel.innerText = 'You Send (CAD)';
                rateContainer.style.opacity = '1';
                rateInput.disabled = false;
            }
            toggleSyriaFields();
        }

        function setReceiveCurrency(cur) {
            const country = document.getElementById('country-input').value;
            if (!getReceiveCurrencies(country).includes(cur)) return;
            if (cur === receiveCurrency) {
                closeCurrencyChipMenus();
                return;
            }
            receiveCurrency = cur;
            renderReceiveCurrencyOptions(country);
            closeCurrencyChipMenus();

            // A currency switch changes the unit of the amount, so clear stale values
            // rather than interpreting an old USD amount as SYP (or vice versa).
            document.getElementById('send-input').value = '';
            document.getElementById('amount-input').value = '';
            lastEditedField = 'recipient';
            toggleSyriaFields();
            updateTicketDestination();
        }

        // --- Main Logic ---
        function toggleSyriaFields() {
            const country = document.getElementById('country-input').value;
            const cityContainer = document.getElementById('syria-city-container');
            const rateContainer = document.getElementById('rate-container');

            renderReceiveCurrencyOptions(country);
            const isSyriaSYP = country === 'Syria' && receiveCurrency === 'SYP';
            cityContainer.style.display = isSyriaSYP ? 'block' : 'none';
            rateContainer.style.display = (isSyriaSYP || sendCurrency === 'USD') ? 'none' : 'block';
            calculate();
        }

        function calculate() {
            currentMode = determineMode();

            const country = document.getElementById('country-input').value;
            const rateStr = document.getElementById('rate-input').value;
            const sourceFieldId = (currentMode === 2 || currentMode === 5) ? 'send-input' : 'amount-input';
            const amountStr = document.getElementById(sourceFieldId).value;
            const syriaCurrency = country === 'Syria' ? receiveCurrency : null;
            const syriaCity = document.getElementById('syria-city-input').value;
            
            const rate = parseFloat(rateStr);
            const amount = parseFloat(amountStr);

            const emptyState = document.getElementById('empty-state');
            const errorState = document.getElementById('error-state');
            const resultsContent = document.getElementById('results-content');
            const errorMsg = document.getElementById('error-message');

            const isSyriaSYP = (country === 'Syria' && syriaCurrency === 'SYP');
            const isJordan = (country.toLowerCase() === 'jordan');

            // Update dynamic labels based on country — the recipient caption always reflects
            // the beneficiary-side currency; the send caption is handled by setSendCurrency().
            const amountLabel = document.getElementById('amount-label');
            const topbarChip = document.getElementById('topbar-chip');

            amountLabel.innerText = `Recipient Gets (${receiveCurrency})`;

            if (sendCurrency === 'USD') {
                topbarChip.innerText = isSyriaSYP ? "SYP Only" : (isJordan ? "JOD Only" : "USD Only");
                topbarChip.style.backgroundColor = "#CCFBF1";
                topbarChip.style.color = "#0F766E";
            } else if (currentMode === 2) {
                topbarChip.innerText = isSyriaSYP ? "CAD → SYP" : (isJordan ? "CAD → JOD" : "CAD → USD");
                topbarChip.style.backgroundColor = "#F3E8FF";
                topbarChip.style.color = "#6D28D9";
            } else {
                topbarChip.innerText = isSyriaSYP ? "SYP → CAD" : (isJordan ? "JOD → CAD" : "USD → CAD");
                topbarChip.style.backgroundColor = "#DBEAFE";
                topbarChip.style.color = "#1D4ED8";
            }

            // Validation for empty state — only the field currently driving the calculation needs a value
            const missingAmount = isNaN(amount) || amount <= 0;
            const missingRate = (!isSyriaSYP && currentMode !== 3 && currentMode !== 5) && (isNaN(rate) || rate <= 0);

            if (missingAmount || missingRate) {
                emptyState.style.display = 'flex';
                errorState.style.display = 'none';
                resultsContent.style.display = 'none';
                return;
            }

            // Check if configured
            if (!country) {
                emptyState.style.display = 'none';
                errorState.style.display = 'flex';
                resultsContent.style.display = 'none';
                errorMsg.innerText = "Please select a destination country to begin.";
                return;
            }

            if (!PRICING[country] && !isSyriaSYP) {
                emptyState.style.display = 'none';
                errorState.style.display = 'flex';
                resultsContent.style.display = 'none';
                errorMsg.innerText = "No pricing rules configured for this country yet.";
                return;
            }

            // Calculations based on mode
            let heroVal, heroLabel, sec1Val, sec1Label, sec2Val, sec2Label = "Agent Fee", profitVal, note, heroColor;
            let fee, profit;
            let customerFeeVal = null;

            if (isSyriaSYP) {
                // Check if rates updated today
                const today = new Date().toLocaleDateString('en-CA');
                if (SYRIA_RATES.lastUpdated !== today) {
                    emptyState.style.display = 'none';
                    errorState.style.display = 'flex';
                    resultsContent.style.display = 'none';
                    errorMsg.innerText = "SYP rates not updated today! Please go to Settings and click 'Update Today' to verify rates.";
                    return;
                }

                if (sendCurrency === 'USD') {
                    emptyState.style.display = 'none';
                    errorState.style.display = 'flex';
                    resultsContent.style.display = 'none';
                    errorMsg.innerText = "USD Payment mode is not applicable when converting to SYP. Please use a CAD mode.";
                    return;
                }

                const cityRates = SYRIA_RATES.cities[syriaCity];
                if (!cityRates || !cityRates.cadSyp || !cityRates.usdSyp) {
                    emptyState.style.display = 'none';
                    errorState.style.display = 'flex';
                    resultsContent.style.display = 'none';
                    errorMsg.innerText = "Rates not found for the selected city.";
                    return;
                }

                if (currentMode === 1) { // SYP to CAD (Beneficiary receives amount)
                    let sypReceived = amount;
                    let cadNet = sypReceived / cityRates.cadSyp;
                    let customerFee = 0;
                    if (cadNet < 500) {
                        customerFee = 10;
                    }
                    let cadPaid = roundToTwo(cadNet + customerFee);

                    let agentUsd = sypReceived / cityRates.usdSyp;
                    fee = 5;
                    customerFeeVal = customerFee;
                    
                    let marketRate = rate || parseFloat(document.getElementById('rate-input').value) || 1.36;
                    
                    profit = cadPaid - ((agentUsd + fee) * marketRate);

                    heroLabel = "Collect from Customer";
                    heroVal = formatMoney(cadPaid, 'CAD');
                    sec1Label = "Beneficiary Receives";
                    sec1Val = sypReceived.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " SYP";
                    sec2Val = formatMoney(agentUsd + fee, 'USD');
                    sec2Label = "Pay Agent (USD)";
                    profitVal = formatMoney(profit, 'CAD');
                    heroColor = 'var(--c-blue)';
                    note = customerFee > 0 ? "Customer Fees Applied: $10 CAD" : "Customer Fees Applied: $0 CAD";
                }
                else if (currentMode === 2) { // CAD to SYP (Customer pays amount)
                    let cadPaid = amount;
                    let customerFee = (cadPaid >= 500) ? 0 : 10;
                    let cadNet = cadPaid - customerFee;
                    
                    if (cadNet <= 0) {
                        emptyState.style.display = 'none';
                        errorState.style.display = 'flex';
                        resultsContent.style.display = 'none';
                        errorMsg.innerText = "Amount too small to cover fees.";
                        return;
                    }

                    let sypReceived = roundToTwo(cadNet * cityRates.cadSyp);
                    let agentUsd = sypReceived / cityRates.usdSyp;
                    fee = 5;
                    customerFeeVal = customerFee;
                    
                    let marketRate = rate || parseFloat(document.getElementById('rate-input').value) || 1.36;
                    profit = cadPaid - ((agentUsd + fee) * marketRate);

                    heroLabel = "Beneficiary Receives";
                    heroVal = sypReceived.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " SYP";
                    sec1Label = "Customer Pays";
                    sec1Val = formatMoney(cadPaid, 'CAD');
                    sec2Val = formatMoney(agentUsd + fee, 'USD');
                    sec2Label = "Pay Agent (USD)";
                    profitVal = formatMoney(profit, 'CAD');
                    heroColor = 'var(--c-purple)';
                    note = customerFee > 0 ? "Customer Fees Applied: $10 CAD" : "Customer Fees Applied: $0 CAD";
                }
            }
            else if (isJordan && currentMode === 1) { // Forward
                let jp = PRICING['Jordan'];
                let jodAmount = amount;
                let usdNet = jodAmount * jp.jodRate;
                let usdAmountRaw = (usdNet <= jp.threshold) ? (usdNet + jp.flatFee) : (usdNet * (1 + jp.pctFee));
                let cadPaid = usdAmountRaw * rate;
                cadPaid = roundToTwo(cadPaid);

                fee = agentFeeUSD(country, usdAmountRaw);
                profit = cadPaid - (usdNet * rate) - (fee * rate);

                heroLabel = "Collect from Customer";
                heroVal = formatMoney(cadPaid, 'CAD');
                sec1Label = "Beneficiary Receives";
                sec1Val = formatMoney(jodAmount, 'JOD');
                profitVal = formatMoney(profit, 'CAD');
                heroColor = 'var(--c-blue)';
                note = (usdNet <= jp.threshold) ? `+$${jp.flatFee} fee applied` : `+${(jp.pctFee * 100).toFixed(2).replace(/\.00$/, '')}% fee applied`;
            }
            else if (isJordan && currentMode === 2) { // Reverse
                let jp = PRICING['Jordan'];
                let cadPaid = amount;
                let usdAmountRaw = cadPaid / rate;
                
                let usdNet;
                if (usdAmountRaw <= jp.threshold) {
                    usdNet = usdAmountRaw - jp.flatFee;
                    note = `-$${jp.flatFee} fee applied`;
                } else {
                    usdNet = usdAmountRaw / (1 + jp.pctFee);
                    note = `-${(jp.pctFee * 100).toFixed(2).replace(/\.00$/, '')}% fee applied`;
                }
                
                if (usdNet <= 0) {
                    emptyState.style.display = 'none';
                    errorState.style.display = 'flex';
                    resultsContent.style.display = 'none';
                    errorMsg.innerText = "Could not solve — check your inputs. Amount may be too small to cover fees.";
                    return;
                }

                let jodAmount = usdNet / jp.jodRate;
                jodAmount = roundToTwo(jodAmount);

                // Recalculate profit using exact JOD received
                fee = agentFeeUSD(country, usdAmountRaw);
                profit = cadPaid - ((jodAmount * jp.jodRate) * rate) - (fee * rate);

                heroLabel = "Beneficiary Receives";
                heroVal = formatMoney(jodAmount, 'JOD');
                sec1Label = "Customer Pays";
                sec1Val = formatMoney(cadPaid, 'CAD');
                profitVal = formatMoney(profit, 'CAD');
                heroColor = 'var(--c-purple)';
            }
            else if (isJordan && currentMode === 3) { // USD Payment
                let jp = PRICING['Jordan'];
                let jodAmount = amount;
                let usdNet = jodAmount * jp.jodRate;
                let usdAmountRaw = (usdNet <= jp.threshold) ? (usdNet + jp.flatFee) : (usdNet * (1 + jp.pctFee));
                usdAmountRaw = roundToTwo(usdAmountRaw);

                fee = agentFeeUSD(country, usdAmountRaw);
                profit = usdAmountRaw - usdNet - fee;

                heroLabel = "Collect from Customer";
                heroVal = formatMoney(usdAmountRaw, 'USD');
                sec1Label = "Beneficiary Receives";
                sec1Val = formatMoney(jodAmount, 'JOD');
                profitVal = formatMoney(profit, 'USD');
                heroColor = 'var(--c-teal)';
                note = (usdNet <= jp.threshold) ? `+$${jp.flatFee} fee applied` : `+${(jp.pctFee * 100).toFixed(2).replace(/\.00$/, '')}% fee applied`;
            }
            else if (isJordan && currentMode === 5) { // USD Payment - Reverse
                let jp = PRICING['Jordan'];
                let usdPaid = amount;
                let usdAmountRaw = usdPaid; // already USD, no rate conversion needed

                let usdNet;
                if (usdAmountRaw <= jp.threshold) {
                    usdNet = usdAmountRaw - jp.flatFee;
                    note = `-$${jp.flatFee} fee applied`;
                } else {
                    usdNet = usdAmountRaw / (1 + jp.pctFee);
                    note = `-${(jp.pctFee * 100).toFixed(2).replace(/\.00$/, '')}% fee applied`;
                }

                if (usdNet <= 0) {
                    emptyState.style.display = 'none';
                    errorState.style.display = 'flex';
                    resultsContent.style.display = 'none';
                    errorMsg.innerText = "Could not solve — check your inputs. Amount may be too small to cover fees.";
                    return;
                }

                let jodAmount = usdNet / jp.jodRate;
                jodAmount = roundToTwo(jodAmount);

                fee = agentFeeUSD(country, usdAmountRaw);
                profit = usdPaid - (jodAmount * jp.jodRate) - fee;

                heroLabel = "Beneficiary Receives";
                heroVal = formatMoney(jodAmount, 'JOD');
                sec1Label = "Customer Pays";
                sec1Val = formatMoney(usdPaid, 'USD');
                profitVal = formatMoney(profit, 'USD');
                heroColor = 'var(--c-teal)';
            }
            else if (currentMode === 1) { // Forward
                let usdAmount = amount;
                let collect = collectCAD(country, usdAmount, rate);
                collect.val = roundToTwo(collect.val);
                fee = agentFeeUSD(country, usdAmount);
                profit = collect.val - (usdAmount * rate) - (fee * rate);

                heroLabel = "Collect from Customer";
                heroVal = formatMoney(collect.val, 'CAD');
                sec1Label = "Beneficiary Receives";
                sec1Val = formatMoney(usdAmount, 'USD');
                profitVal = formatMoney(profit, 'CAD');
                heroColor = 'var(--c-blue)';
                note = null;
            } 
            else if (currentMode === 2) { // Reverse
                let cadPaid = amount;
                let usdAmount = reverseUSD(country, cadPaid, rate);
                
                if (usdAmount === null || usdAmount <= 0) {
                    emptyState.style.display = 'none';
                    errorState.style.display = 'flex';
                    resultsContent.style.display = 'none';
                    errorMsg.innerText = "Could not solve — check your inputs. Amount may be too small to cover fees.";
                    return;
                }

                usdAmount = roundToTwo(usdAmount);

                fee = agentFeeUSD(country, usdAmount);
                profit = cadPaid - (usdAmount * rate) - (fee * rate);

                heroLabel = "Beneficiary Receives";
                heroVal = formatMoney(usdAmount, 'USD');
                sec1Label = "Customer Pays";
                sec1Val = formatMoney(cadPaid, 'CAD');
                profitVal = formatMoney(profit, 'CAD');
                heroColor = 'var(--c-purple)';
                note = null;
            }
            else if (currentMode === 3) { // USD Payment
                let usdAmount = amount;
                let collect = collectUSD(country, usdAmount);
                collect.val = roundToTwo(collect.val);
                fee = agentFeeUSD(country, usdAmount);
                profit = collect.val - usdAmount - fee;

                heroLabel = "Collect from Customer";
                heroVal = formatMoney(collect.val, 'USD');
                sec1Label = "Beneficiary Receives";
                sec1Val = formatMoney(usdAmount, 'USD');
                profitVal = formatMoney(profit, 'USD');
                heroColor = 'var(--c-teal)';
                note = collect.note;
            }
            else if (currentMode === 5) { // USD Payment - Reverse
                let usdPaid = amount;
                let reverseResult = reverseUSDPayment(country, usdPaid);

                if (!reverseResult || reverseResult.val <= 0) {
                    emptyState.style.display = 'none';
                    errorState.style.display = 'flex';
                    resultsContent.style.display = 'none';
                    errorMsg.innerText = "Could not solve — check your inputs. Amount may be too small to cover fees.";
                    return;
                }

                let usdAmount = roundToTwo(reverseResult.val);
                fee = agentFeeUSD(country, usdPaid);
                profit = usdPaid - usdAmount - fee;

                heroLabel = "Beneficiary Receives";
                heroVal = formatMoney(usdAmount, 'USD');
                sec1Label = "Customer Pays";
                sec1Val = formatMoney(usdPaid, 'USD');
                profitVal = formatMoney(profit, 'USD');
                heroColor = 'var(--c-teal)';
                note = reverseResult.note;
            }

            // Render
            emptyState.style.display = 'none';
            errorState.style.display = 'none';
            resultsContent.style.display = 'flex';

            const heroLabelEl = document.getElementById('hero-label');
            const heroValueEl = document.getElementById('hero-value');
            const heroNoteEl = document.getElementById('hero-note');
            const sec1LabelEl = document.getElementById('sec1-label');
            const sec1ValueEl = document.getElementById('sec1-value');
            const sec2LabelEl = document.getElementById('sec2-label');
            const sec2ValueEl = document.getElementById('sec2-value');
            const sec3ValueEl = document.getElementById('sec3-value');
            const sec3TileEl = document.getElementById('sec3-tile');
            const profitValueEl = document.getElementById('profit-value');

            // Set content
            heroLabelEl.innerText = heroLabel;
            heroValueEl.innerText = heroVal;
            heroValueEl.style.color = heroColor;
            
            sec1LabelEl.innerText = sec1Label;
            sec1ValueEl.innerText = sec1Val;
            
            sec2LabelEl.innerText = sec2Label;
            sec2ValueEl.innerText = sec2Val || formatMoney(fee, 'USD');

            if (customerFeeVal !== null) {
                sec3ValueEl.innerText = formatMoney(customerFeeVal, 'CAD');
                sec3TileEl.style.display = 'block';
            } else {
                sec3TileEl.style.display = 'none';
            }

            profitValueEl.innerText = profitVal;

            if (note) {
                heroNoteEl.innerText = note;
                heroNoteEl.style.display = 'inline-block';
            } else {
                heroNoteEl.style.display = 'none';
            }

            // Sync the box the user ISN'T actively typing into with the computed opposite-side
            // amount. heroVal/sec1Val already hold the send-side and recipient-side figures —
            // which one is which just flips with mode: modes 2/5 (reverse) have heroVal=recipient,
            // sec1Val=send; modes 1/3 (forward) have heroVal=send, sec1Val=recipient. We only
            // ever write to the field that ISN'T sourceFieldId, so the user's live typing is
            // never touched or reformatted mid-keystroke.
            function extractNumber(str) {
                if (!str) return NaN;
                return parseFloat(String(str).replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
            }
            const recipientInputEl = document.getElementById('amount-input');
            const sendInputEl = document.getElementById('send-input');
            const recipientDecimals = 2;

            if (currentMode === 2 || currentMode === 5) {
                const recipientRaw = extractNumber(heroVal);
                if (!isNaN(recipientRaw)) recipientInputEl.value = recipientRaw.toFixed(recipientDecimals);
            } else {
                const sendRaw = extractNumber(heroVal);
                if (!isNaN(sendRaw)) sendInputEl.value = sendRaw.toFixed(2);
            }

            // Trigger animations
            document.querySelectorAll('.anim-value').forEach(triggerAnim);
        }

        // --- Event Listeners ---
        function setMode(mode) {
            document.querySelectorAll('.nav-item').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.mode) === mode);
            });

            const topbarTitle = document.getElementById('topbar-title');
            const topbarChip = document.getElementById('topbar-chip');
            const sidebarDesc = document.getElementById('sidebar-desc');

            const calcGrid = document.getElementById('calc-grid');
            const settingsGrid = document.getElementById('settings-grid');

            if (mode === 4) {
                calcGrid.style.display = 'none';
                settingsGrid.style.display = 'grid';
                topbarTitle.innerText = "Settings & Market Rates";
                topbarChip.innerText = "Configuration";
                topbarChip.style.backgroundColor = "#F1F5F9";
                topbarChip.style.color = "#475569";
                sidebarDesc.innerText = "Configure pricing tiers, margins, and fetch live CAD/USD spot rates.";

                populateSettingsForm();
                if (document.getElementById('spot-rate-value').innerText === '--') {
                    fetchSpotRate();
                }
                return;
            }

            calcGrid.style.display = 'grid';
            settingsGrid.style.display = 'none';
            topbarTitle.innerText = "Transfer Calculator";
            sidebarDesc.innerText = "Both sides are editable — change either amount to solve from that side.";

            calculate();
        }

        // Attach listeners
        document.getElementById('country-input').addEventListener('input', calculate);
        document.getElementById('rate-input').addEventListener('input', event => {
            event.currentTarget.dataset.manuallyEdited = 'true';
            calculate();
        });
        document.getElementById('amount-input').addEventListener('input', () => {
            lastEditedField = 'recipient';
            calculate();
        });
        document.getElementById('send-input').addEventListener('input', () => {
            lastEditedField = 'send';
            calculate();
        });

        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                setMode(parseInt(e.currentTarget.dataset.mode));
            });
        });

        // Country presentation data must be initialized before the selects are populated.
        const FLAG_DATA = {"sy": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5MDAiIGhlaWdodD0iNjAwIj48cGF0aCBkPSJNMCAwaDkwMHY2MDBIMHoiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMCAwaDkwMHY0MDBIMHoiLz48cGF0aCBmaWxsPSIjMDA3YTNkIiBkPSJNMCAwaDkwMHYyMDBIMHoiLz48cGF0aCBmaWxsPSIjY2UxMTI2IiBkPSJtMTc2LjI2IDM3NSA0OC43MzgtMTUwIDQ4LjczOCAxNTAtMTI3LjYtOTIuNzA1aDE1Ny43Mk02MjYuMjU2IDM3NWw0OC43MzgtMTUwIDQ4LjczOCAxNTAtMTI3LjYtOTIuNzA1aDE1Ny43Mk00MDEuMjUyIDM3NWw0OC43MzgtMTUwIDQ4LjczOCAxNTAtMTI3LjYtOTIuNzA1aDE1Ny43MiIvPjwvc3ZnPg==", "lb": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyODgwIiBoZWlnaHQ9IjE5MjAiPjxwYXRoIGZpbGw9IiNkMzE2MjQiIGQ9Ik0wIDBoMjg4MHYxOTIwSDB6Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgNDgwaDI4ODB2OTYwSDB6Ii8+PHBhdGggZmlsbD0iIzAwOGMzZSIgZD0iTTE0MjYgNDgwYy0xMy40MTIgMjQuNjk2LTI4LjI2IDQ5LjQ2OC01MS41IDY2LjI1YTI1OSAyNTkgMCAwIDAtMTEuNzggOC40ODRsLTIuMjIgMS43MDNhNzIwIDcyMCAwIDAgMC02LjIyNSA0Ljc3OEwxMzUyIDU2M2MtNy4yMzkgNS42NDktMTMuOTM0IDExLjY1Mi0yMC40MTQgMTguMTRhOTM3IDkzNyAwIDAgMS00LjgzIDQuODQ0Yy03Ljc2NCA3LjcwMy0xNy4yMjMgMTUuOTI3LTIxLjc1NiAyNi4wMTYgMi4yNjIgMCAyLjI2MyAwIDguNzMtMS44M2wyLjc3LS43OTVhMzYzIDM2MyAwIDAgMCAyMS4zMTMtNi43NWM1LjY1OS0yLjA5NSAxMC4xMjMtMi45MSAxNi4xODctMi42MjUtLjI2OCAyLjAxLS42MSA0LjAxLTEgNi0xMS4yNTYgMTYuODg0LTM0LjE0OCAzMC4zODUtNTIuMzc1IDM4LjI1LTUuNDcgMi4zNS0xMC43NjYgNC42Ni0xNS44MDUgNy44NjNMMTI4MiA2NTRjLTEyLjcyMiA4LjQtMjUuMzA1IDE2LjE4LTM0IDI5bDIgNHEyLjU2OC4wMyA1LjEzNy4wNDlsMi4xMTMuMDE0YzMuMzI3LjA0IDYuNi4yMDUgOS44Ni0uNTU1IDIuMDI4LS42MTMgMi4wMjgtLjYxMyA0Ljc2NS0uNjc2bDMuMTI1LS4wMmMzLjA4Ni0uMDkgMy4wODYtLjA5IDYgLjE4OCAyLjg4Ny45MyAzLjg1OCAxLjgxMyA1LjcwMyA0LjI1IDMuNDkgNi4yMDYgNS43NjIgMTEuNTUyIDQuMjk3IDE4Ljc1LTQuODc2IDQuODc2LTExLjI1IDUuMjcyLTE3LjgxMyA1LjYyNS02LjA0OC4yNTUtMTAuMTQzIDEuMjY3LTE1LjYzMiAzLjg1LTEyLjE4OCA1LjkwNS0yNS4xOTggMTQuOTMzLTI5Ljg2OCAyOC4yNzVMMTIyNyA3NTBjLTE4LjcyIDIyLjExNC0xOC43MiAyMi4xMTQtNDYuMzgzIDM0LjE2NC03Ljc5NCAzLjgyNi0xNS4zMiA3Ljg3OS0yMi43MTUgMTIuNDM0YTQyNiA0MjYgMCAwIDEtNi4wMiAzLjY2NGMtMTMuOTk4IDguMjg2LTI3LjkyNyAxNy4wMTQtNDAuMDA3IDI3Ljk4OC0zLjA5IDMuMjM4LTQuNDU2IDUuMjk3LTQuNTYzIDkuODEzQzExMDggODQyIDExMDggODQyIDExMDkgODQzYzQuMDIgMi40MjcgNy4xNDkgMy4zNDQgMTEuODU3IDMuMzE2bDIuMTQzLS4wNjZxMi4yOTktLjA1IDQuNTk4LS4xMDUgMi4yLS4wNzggNC40MDItLjE0NWMxNS45Ny4wNTcgMzEuNTcyLTUuMDc2IDQ2LjU1OS0xMC4yMyA0LjU2My0xLjYyIDcuNjg2LTIuMzIzIDEyLjQ0MS0uNzcgNS45MTUgNC45NjEgNS45MTUgNC45NjEgOS4zNSAxMS45OWwxLjQ2MyAzLjA3MmMxLjk5MiAzLjkxNyAzLjgzNiA3Ljc1IDUuMTg3IDExLjkzOCAxLjAwNSA3LjU2Ny4wNjcgMTQuNDU4LTMuODEzIDIxLjEwNWwtMi4xODcgMy4wODJjLTMuOTY0IDUuNTg3LTguMjE2IDEwLjg4Ny0xMi42NiAxNi4wOThMMTE4NiA5MDVjLTQuMjc0IDUuMTMtOC42OTQgOS43NzItMTMuNzcgMTQuMTI1TDExNzAgOTIxYy04LjE2OCA3LjI3Ni0xOC4zNDQgMTEuMDMzLTI4Ljg5NyAxMy40MzItNS43MyAxLjI4NC0xMS4xNTMgMi43OTUtMTYuNTQzIDUuMTZsLTIuMTIyLjk3Yy0xMy44OTEgNi4xMDMtMjUuMjQ0IDE2LjY1My0zNS42NjcgMjcuNDE4YTEyODcgMTI4NyAwIDAgMS02LjkyMyA3LjA5OGwtMS42ODggMS43MTljLTMuNDM3IDMuNTEtNi44ODIgNi45NDUtMTAuNTk0IDEwLjE2OC0xLjc1IDEuNDg0LTMuNDg2IDIuOTYyLTUuMTY4IDQuNTI1LTUuNDU2IDUuMjMxLTEwLjkxOCAxMC4zMjItMTcuMDEgMTQuODE3bC0xLjgyNSAxLjMxOGMtMy4yMDggMi4zNC02LjIyMSA0LjI0Ny05Ljk3MyA1LjY0OGwtMi41OS43MjdjLjEyNSAyLjE4OC4xMjUgMi4xODggMSA1IDUuODA0IDYuMTE4IDE0LjM4IDEwLjI5IDIyLjUgMTIuMzc1IDE4Ljk1MyAzLjM4MyAzNS4yLTYuMDg5IDUwLjMzMi0xNi41IDQuMTgyLTIuODkgOC4zNzYtNS43NjIgMTIuNjE1LTguNTY4bDIuOTI4LTEuOTMyYzUuMDcxLTMuNDgyIDkuMzM1LTYuNzUzIDE1LjY2NC02LjgzNiA2LjIwMy43MjIgOS44MjEgMy45MzggMTMuNzcgOC41OTQgNi43OSA5LjA4MiAxMC44MTMgMTkuMzk3IDkuMTkxIDMwLjg2Ny0zLjM2MiA3Ljg2NS05Ljk3MyAxMy40ODctMTcuMjA1IDE3LjcwMWwtMi42NyAxLjQ4NmMtNy4yOSA0LjE5Mi0xNC42NzIgOC4yLTIyLjA5MiAxMi4xNTctMjIuMTQ1IDExLjc5My00Mi44MjMgMjUuMzU0LTYxLjc4MyA0MS44NjNxLTEuNjE0IDEuNDEtMy4yNSAyLjc5M2MtOS4xNDggNy4xODYtMTcuMjA0IDE1LjA1NS0yNS4zMTMgMjMuMzc1LTE0LjAwMSAxNC40MTEtMjguMTk3IDMwLjkxOC00OS41MTkgMzEuNDJsLTMuNzkzLjAxN2MtMy42NTUuMDcyLTcuMzA4LjE0My0xMC45NjMuMTc2TDk2MCAxMTY4YzEuOTI2IDMuMDU1IDMuODk2IDYuMDY0IDYgOSA3LjQ0IDcuNjQzIDE1LjYyOCAxMi4wNjIgMjYuMjkgMTIuNDU5bDIuMjczLjA0MWMxMi40MjYuMzQzIDEyLjQyNS4zNDQgNDAuNDc2LTguODE0bDIuMDg2LS42ODZjMjkuNzMtOS43IDYwLjc1OS0yMC4yNzQgODYuODM2LTM3Ljg3NSA1LjU2My0zLjg5IDExLjA3NC03Ljg2NSAxNy4wMzktMTEuMTI1IDE0LjA4LTYuNTIzIDI4LjgxNy03LjA3NiA0My40MzgtMS44NzUgNS41NTIgMi4xOTcgOS45NCA0LjI5NiAxMi41NjIgOS44NzUuODMxIDMuNzYzLjQ0MiA2Ljg5NS0xIDEwLjUtNTYuMDA4IDQyLjQxOC01Ni4wMDggNDIuNDE4LTEyNS40MTYgNjEuMzU1LTE5LjIzNyA1LjM5NC0zOC41ODggMTEuMzctNTYuNTg0IDIwLjE0NWwtLjMxMyAzYy4wNSA0Ljk0NCAxLjk3NiA4LjQyMiA1LjMxMyAxMiA5LjUzMiA2Ljc0NCAyMS40MjcgOC4zNTcgMzIuODA3IDguMzY3bDMuODE4LS4wNTRjMTAuNDEtLjA5NCAyMC43NTUtLjIzOCAzMS4wNDctMS45MTVMMTA4OSAxMjUyYzEzLjQ1NS0yLjI0NCAyNi4xNDUtNS4zMSAzOC43ODUtMTAuNDU3YTcxMSA3MTEgMCAwIDEgMTIuNDQyLTQuOTg0YzI1LjQyOC05LjkgNTAuODU4LTE5LjkgNzUuNzM2LTMxLjEyN2wyLjcyOC0xLjIzN2M0LjQzNy0yLjAwOCA4Ljg3NC00LjAxNyAxMy4yOTUtNi4wNTggMTAuNDEyLTQuODE0IDIxLjg2OS0xMS4yMTUgMzMuNTc2LTExLjQ1IDE0LjQwMiAxLjMxIDI4LjYyNyA5LjM3IDM4Ljg3NiAxOS4yNSA5LjY1NiAxMC4zIDE0LjY2OSAyMC41NTcgMTQuODc4IDM0Ljg2Ni0uMDY1IDQwLjI4LTMyLjg3OCA4Mi44Ni02MC4wMzUgMTEwLjIzOGwtMi42NTYgMi42NDdjLTkuMDcgOS4yMzctMTguNDAyIDE2Ljg3MS0yOS44NTUgMjIuOTc4bC0yLjgzMiAxLjQ1OWMtOC40IDQuMzUzLTE2LjczMiA3LjkxLTI1Ljc4MiAxMC42NDgtOC4xOTUgMi40MTMtMTYuNTA4IDQuODQtMjQuMjgxIDguNDE1LTE2LjE4OCA4LjY0NC0zMy42MjQgMjUuMjI2LTM5Ljg3NSA0Mi44MTJoMTIuNzMyYy44ODMtLjI3MyAxLjU2Mi0uNjA0IDIuMTgtMS4xNCAxMi45My0xNi44NTQgMjkuNDcxLTMwLjA1NSA1MS4wODgtMzMuODYgMy4yOS0uMjg1IDYuNTc0LS4zNjEgOS44NzUtLjQzOCAzNC4zMzktMS4zNjYgNjguNjc4LTEzLjQ5MyA5NC4xNjQtMzYuOTY4IDE4LjI1LTE1Ljk4NyA0NS40MDMtMzcuODcxIDcwLjU4Ni0yMi41OTQgMTAuNDY2IDUuMzc0IDIxLjc1NCA0LjQxNSAzMi42MjkuOTY5bDMuMzA5LTEuMDk0YzcuMjYtMi4zMTYgMTMuODg0LTMuNTg4IDIwLjkzNy0uMTg4IDMuOTA4IDMuNjE1IDUuNTEyIDYuMjE2IDUuODc1IDExLjUuNjkgNy42ODYgNC4wNjMgMTMuNzIyIDkuNjg4IDE4LjkzOCA0LjM1NyAzLjYwMiA5LjAyNCA2LjY3IDEzLjc2MSA5Ljc0NiA1LjYwOSAzLjc2IDEwLjg4NiA3LjkzOCAxNi4xNzYgMTIuMTI5bDIuNzczIDIuMThjNi4wNDkgNC44NDIgMTEuNzM0IDkuOTg5IDE3LjI4MiAxNS4zOTIgNS4xMjQgNC44OTQgOS43NzEgNy41NzQgMTYuOTQ1IDguNDI4LTEuOTc4LTExLjA2NS02LjY4NC0yMC4zMDEtMTIuNzI3LTI5LjY4LTIuMDItMy42ODItMS42ODEtNi4xNzEtMS4yNzMtMTAuMzIgMTAuNzcxLTcuMTggMzIuOTg2LTEuMzA2IDQ1LjM3NS4xODhsMi41NzQuMjk2YzEwLjU4OCAxLjI0MSAxOS45MjEgMy4xNjUgMjguNDYxIDYuNTE0IDUuODg2IDEuOTEgMTEuMzUzIDQuNjkgMTUuOTYgOC43OTUgNC4wNzYgMy4wNzEgNy45ODkgNi43MjUgMTEuNzgyIDExLjE0IDIuNzU2IDMuMDgzIDUuNzE3IDUuOTQ3IDguNjY0IDguODQ0IDEuOTg5IDIuMDI0IDMuODA4IDQuMTA2IDUuNjIxIDYuMjg1IDMuMzY4IDMuOTQ0IDcuMjIgNy4wMzEgMTEuMzI5IDEwLjE3NiAyLjIxNCAxLjc0NiAyLjI2MSAxLjc5MSA1LjE4MSA0LjcxMS4xMi4wMzYuMzgyLjAxNy41MDQuMDUxSDE2NjN2LTFjLTguNzQ3LTEyLjgwNi0xOS43ODMtMjQuMTItMzEuODEzLTMzLjg3NS0yLjcxLTIuMTMxLTUuMzQ4LTQuMjctNy45MTctNi41Ny0zLjU1Mi0zLjI3Ni03LjA2NC02LjU3MS0xMC44MS05LjYyNS01Ljk5MS00Ljc2MS0xMS41OTYtOS43ODgtMTcuMTQ4LTE1LjA1NS0zLjQyOC0zLjI3NC02LjgzMi02LjU2Ny0xMC4zODQtOS43MDctMTcuMTEzLTE0Ljg0NC0zMC40MS0zMC43MzUtMzguODAzLTUyLjEzM0wxNTQ1IDEzMDljLTIuOTgtNy42MjctNC4yMy0xNC45NS00Ljg1Ny0yMy4wNzJsLS4yNC0zLjQ3OWMtLjkwMi0xMi45MzYtMS4xODQtMjUuODM0LTEuMTc2LTM4Ljc5OS4wMTItMy45NTguMDI1LTcuOTE2LjAxMS0xMS44NzUtLjAxLTIuNjUzLS4wMS01LjMwNy0uMDEtNy45NmwuMDA2LTMuNzk1Yy0uMDMtOC42NC40MzYtMTYuMjMyIDMuMDU1LTI0LjUxNiA0LjQxLTEwLjI0MyAxMS42NzgtMTkuMjQ0IDIyLjIxMS0yMy41MDQgOS4xOTctMS4zNjMgMTcuMTE2LjU4OSAyNS41NDEgNC4zMDlsMi4wODQuOTQxYTM2OSAzNjkgMCAwIDEgMTUuNTYzIDcuMzI4cTEuODU1LjkzIDMuNzE0IDEuODU0IDIuODM0IDEuNDA0IDUuNjYgMi44MThjMTcuMjQxIDguODggMzIuNDYyIDExLjI1MiA1MS43MDggMTEuMjU0IDQuNTktLjAyIDkuMTc4LS4wMzcgMTMuNzctLjAyMiA4LjQ1NS4wMzEgMTYuOTEuMDMgMjUuMzY2LjAyYTYzNjYgNjM2NiAwIDAgMSAyNy42NC4wMDhjNC4wMDIuMDE0IDguMDAyLjAyMSAxMi4wMDMuMDA0IDEyLjYyNi0uMDU3IDI0LjYzMi0uMTc3IDM2LjgxNCAzLjQyNkwxNzg3IDEyMDVjMjQuOTk4IDEwLjkyMiAyNC45OTggMTAuOTIyIDQ3Ljk5NiAyNS44NzUgMi40IDEuNTAxIDQuOCAzIDcuMjExIDQuNDggNi45MjYgNC4yMzMgMTMuNzMzIDguNTQ1IDIwLjM0NCAxMy4yNTggOC45MTkgNi4zODcgMTguMTczIDEzLjc1NSAyOC44MTIgMTYuOTYxIDcuNDEyIDEuMTk3IDE2Ljc3MyAyLjEwMSAyMy4wNzQtMi4yNjIgMy44MDUtMy40MzIgNS4yNTYtNi41MzcgNi4xMjYtMTEuNTYyLTEuOTkzLTEzLjI4My0xNC43ODItMjQuNTg0LTI0Ljg0LTMyLjQxOEwxODk0IDEyMThjLTIwLjU0Ny0xNS45OC00Mi4yMzctMzEuMDExLTY1LjM3NS00M2E1NTUgNTU1IDAgMCAxLTIwLjYyNS0xMS4xODhjLTUuNzE1LTMuMjU2LTExLjQzLTYuNTA4LTE3LjE5My05LjY4MS0xNy42MDYtOS42NzctNDAuMjc3LTE5LjAxNS01MC44MDctMzcuMTMxLS43MjYtMy40NTctLjM0OC02Ljc4Mi42MjUtMTAuMTg4IDMuMjg1LTQuMzMgNy44NjctNy4zMDUgMTIuNTc2LTkuODk0bDEuODYxLS45OGM0LjgyNi0yLjU0NCA5LjYyLTQuNzIzIDE0LjgxMy02LjQzOCAyMC41MDUtLjU0NiAyMC41MDUtLjU0NiAzOC44NzUgMTAuMzc1IDExLjMyOSA2LjIzIDIzLjU1OSAxNC4zNjggMzYuNjI5IDE1Ljk0MWwyLjYyMS4xODRjMTAuNTU2IDEuMDc4IDEwLjU1NiAxLjA3OCAzNy01di0ybC0xLjQ3My0xLjI4M2EyMzAgMjMwIDAgMCAxLTEyLjQxLTkuNDZxLTIuMDU1LTEuNjg0LTQuMTEzLTMuMzY0bC0yLjExMy0xLjcyNWE2NzIgNjcyIDAgMCAwLTYuNjU3LTUuMzY3Yy00LjgyLTMuODA3LTkuNTE5LTcuNzMtMTQuMTcxLTExLjczOC0zLjMxNC0yLjg2LTYuNjMtNS43MDgtMTAuMDE2LTguNDgxLTQuNjM4LTMuNzQ0LTkuMTU4LTcuNTQ3LTEzLjU0Ny0xMS41ODItMi42My0yLjQyNS01LjI0OC00Ljc5OC04LjA0LTcuMDM1LTUuMjk2LTQuMTUzLTEwLjE2NS04LjUzMS0xNC45NDgtMTMuMjY2bC0yLjI2Mi0yLjI2MmMtNC4xMzItNC4xMjctOC4xNzItOC4yOTMtMTItMTIuNzA2QTYwNiA2MDYgMCAwIDAgMTc4MCAxMDE3Yy0xNS41NTgtMTUuOTMzLTM4LjA3OC0yMi45NDUtNTkuODc1LTIzLjYyNS04LjM3My0uMTQtMTguNTczLjY2My0yNS4xMjUtNS4zNzUtMS4yNDgtMy40MDUtMS4yNDgtMy40MDUtMS03IDUuMTktNi4yNjUgMTUuMzg5LTguMzg4IDIzLjA5NC05LjY3MmwzLjA5My0uNDUzYzIxLjc2My0yLjQxIDIxLjc2Mi0yLjQxIDQzLjY2LTMuMTc0bDMuMTA0LS4xMDVxMi45NjctLjEwMyA1LjkzNi0uMjAxYzQuODQ3LS4xNCA5LjY0Ni0uMjg1IDE0LjQ1OS0uOTA1IDIuMDQzLS4yNzQgNC4wOTItLjUyIDYuMTQ4LS42NjRsMi4wOTItLjA3MiAyLjM2My0uMDk2YzYuNTM2LS4yNiAxMi45OTItLjQ2NyAxOS4zNzUtMS45OTggMS41NTYtLjM4NCAzLjExNi0uNzUxIDQuNjg2LTEuMDc4cTIuMjk1LS40NjggNC41ODYtLjk1NWwyLjM0MS0uNTAyQTY4IDY4IDAgMCAwIDE4MzcgOTU5YzIuMDY2LTEuODgzIDIuMDY2LTEuODgzIDMtNCAuMDA0LTIuMDQuMDA0LTIuMDQtMS00LTkuNjg4LTcuNjczLTkuNjg4LTcuNjczLTM3LjIzNC0xNS44ODNhODI5IDgyOSAwIDAgMS02LjE4Mi0xLjg1NWMtNC44My0xLjQ4My05LjY2Mi0yLjk2LTE0LjQ5OC00LjQyMkwxNzc1IDkyN2MtMTAuNjIxLTMuMjY2LTIxLjI1Ny02LjM1My0zMi4wNS04Ljk5NmwtMi45MzQtLjcxNWMtNC45NjUtMS4yMTYtOS45MjgtMi40MzYtMTQuOTAzLTMuNjExcS0yLjg2NS0uNjc3LTUuNzI4LTEuMzdsLTIuNzI1LS42NmMtOC44NDYtMi4wMjgtMTcuOTgtNS4xMzctMjMuNjYtMTIuNjQ4LS4zNzctMy4yMDQtLjQ0NC01LjExMSAxLTggMy40NzctMy41OTggNi4xODctNC41MTggMTEuMTc0LTQuNjA1bDIuNTE0LjA0M2MxMC4zMDEuMDkxIDIwLjM3MyAxLjU2IDMwLjUyOSAzLjE0OCAxMC45MzUgMS43MTcgMjEuODYzIDMuMjM3IDMyLjg2NSA0LjQ2NWwyLjM1NS4yNjFjOS4wMjIgMS4wMzcgMTguNSAyLjczIDI3LjU2MyAxLjY4OCAyLjUyMS0xLjAxNyAzLjY4NC0xLjQzMiA1LjAxNi0zLjgyNC0uMDE2LTIuMTc2LS4wMTYtMi4xNzYtMS43Mi00LjUwOGwtMi41NDYtMi40OGMtNi43MDctNi43MTgtNi43MDgtNi43MTgtMjUuODQ0LTE3LjMyMy05Ljc4Ni01LjM5NC0xOS41MzEtMTAuODM0LTI5LjAzOS0xNi43MDlMMTc0NSA4NTBjLTI0LjM3NC0xNC45NDktNDkuNTcyLTMwLjg4LTcwLjQ0NS01MC41NS0xMi41Mi0xMi4wMDMtMjUuNDI5LTIzLjYzLTM5LjMyLTM0LjAzMnEtMS42Mi0xLjIwNi0zLjIzNS0yLjQxOGMtOC40ODUtNi42NDctMTcuMTYzLTExLjc3OC0yNi44MTMtMTYuNjI1LTQuMTQyLTIuMDA1LTguMjI4LTQuMDI0LTEyLjE4Ny02LjM3NS00LjEwNi0yLjk4OS04LjQ1OS01LjYtOS42MjEtMTAuNzQ2LS4xNzItMy4zOTgtLjI2Ni02LjAzOSAxLjc5My04Ljg2IDUuMDUtMy44NTEgOS4yNTEtNC43ODMgMTUuNDY3LTQuODYzbDIuODYxLjAzMmMxMi4wOS4xMDIgMjEuNDM3IDIuMjIgMzIuMjUgNy44NzUgNC42MzIgMi40MjIgOS4wOSA0LjMwNSAxNC4xMDUgNS43ODVsMi4zMzIuNjUyYzkuMTI2IDIuNjAyIDE4LjMwNCAzLjI0IDI3Ljc2OCAzLjIzOGwyLjc0NC0uMDE1cTQuNDY1LS4wMDYgOC45My0uMDIyIDMuMDg4LS4wMTQgNi4xNzYtLjAyMSA5LjA5OC0uMDE4IDE4LjE5NS0uMDU1Yy0xLjEtMi4xOTgtMS4xLTIuMTk3LTYuODc3LTQuNTEtMjMuMzI0LTkuMjM3LTQ1LjI0OS0yMi4xMzctNjUuMzMtMzcuMTQ2TDE2NDIgNjkwYy0xMC4wMy03LjQ0OC0yNS41NDQtMTUuOTcyLTMwLTI4YTY4NzggNjg3OCAwIDAgMSAyMC4zMTMtLjA2M2MxMi44MDYtLjA1NyAyNS41NDEuMDcgMzguMzI4Ljg0NkwxNjc0IDY2M2MtMS0zLS45OTktMy0yLjU1OS00LjQ2N2wtMi4wMi0xLjUzNy0yLjI0Ny0xLjcyOC0yLjQyNC0xLjgzcS0zLjcyNi0yLjg1OC03LjQ2My01LjdhMTEzNyAxMTM3IDAgMCAxLTUuNzQtNC4zOUwxNjQ4LjUgNjQxYTkzMSA5MzEgMCAwIDEtOC41My02LjU5NGMtMTAuMDYyLTcuOTI0LTIwLjE4LTE1LjcxMS0zMC43Ny0yMi45MjJMMTYwNyA2MTBjLTExLjE5Ni03LjU3LTIyLjM5LTE0LjE0Ny0zNC45NTEtMTkuMTlMMTU3MCA1OTBjLTYuNDYzLTIuNTg3LTEyLjkxMi00LjgxNi0xOS42OTMtNi40MjJsLTIuMDYtLjQ3NmE1ODcgNTg3IDAgMCAwLTE2LjI1OS0zLjU1NXEtMy41NS0uNzItNy4wOTctMS40NS0yLjM4My0uNDg4LTQuNzY2LS45NzJjLTkuNTk5LTEuODgtMTguNDM1LTMuNTI2LTI2LjkxLTguNjhMMTQ5MSA1NjdjLTEyLjYzNS03LjY2Mi0yMi42NTQtMTcuNTYxLTMxLjc5Ny0yOS4xMjFMMTQ1NyA1MzVjLTEwLjcwOC0xMy44NzUtMTkuMjM0LTI4LjgyOC0yNS41NjMtNDUuMTg4bC0uOTc2LTIuNjI4LS45MDItMi40MTRjLS45NTYtMi42NDgtLjk5OS0zLjQ5LTMuNTU5LTQuNzdtLTEwNi41NiAxODEuNjM3YzEuNzU0LjAwMyAzLjU4NS4xODcgNS41Ni4zNjMgNC4yMzkuOTY4IDcuODg4IDEuODg4IDExIDUtLjc4NSA3Ljc4Ni05LjIyNCAxNC41MjItMTQuNzkzIDE5LjI2Ni03LjQ3MSA1Ljg3MS03LjQ3MSA1Ljg3MS0xMS41ODIgNS41NDdDMTMwOCA2OTEgMTMwOCA2OTEgMTMwNyA2OTBjLS4zMDctMy4yMi0uMjc4LTYuNDU1LS4zMTMtOS42ODhsLS4wODctMi43MjRjLS4wNTUtNS43MTQuNDg2LTkuMTEgNC40LTEzLjU4OCAyLjgwNi0xLjg3IDUuNTE2LTIuMzY4IDguNDQtMi4zNjNtMTU4LjQ3MiAxNS42MjljMi45LS4wMDkgNS44NzQuNjM1IDguNzkxIDEuOTggMy41NjQgMi4zMDUgNS45MjcgNC4xOTggOC4yOTcgNy43NTQuNDA2IDIuMzQuNDA2IDIuMzQuNSA0LjkzOGwuMTU2IDIuNTljLS42NTQgMi40NzItLjY1NiAyLjQ3Mi0zLjA1OCA0Ljc2NS00LjcyMSAyLjI0LTguNTEgMi4yMjUtMTMuNjYgMi4wODJsLTIuNjgyLS4wMDRjLTUuNTkzLS4wNzUtMTAuMTE0LS4yMy0xNC4yNTYtNC4zNzEtLjYwNS00LjQ0MS0uNDkzLTguNjY1IDEuMDYzLTEyLjg3NSA0LjA1NC00LjQ0NiA5LjMxNC02Ljg0MyAxNC44NS02Ljg2em02Mi43MTMgNC4yNzNjMy45OTguNTQ2IDUuNjI4IDEuNTQgOC4zNzUgNC40NjEgMi4wNTIgNi40MzUtMS4wNjMgMTQuMjktNCAyMC0zLjIxNCA0LjAzOS03Ljk5IDYuODQxLTEzIDgtMTEuMjkyIDEuMTMyLTExLjI5MiAxLjEzMi0xNS4zNjMtMS41NjYtMi4yNi0zLjM2MS0yLjE3LTUuNzg1LTIuMTM3LTkuODA5bC0uMDMxLTMuODk4Yy43NTctNS4zMjQgMy4zMDgtOS4xMTEgNy40NjgtMTIuNDc3IDUuMDA5LTMuNjggOC44NTktNC41NTggMTUuMDYzLTQuNjI1em0tMTA4LjUxLjAxOGMxLjI1Ni4wMjkgMi41NDcuMTcgMy44ODUuNDQzIDMuMTA3IDEuNzE5IDUuMzg3IDMuNzc0IDcgNyAuNTI5IDYuNzA0LjkxMSAxMy4zLTMgMTktNy4xMjMgNS45NjgtMTUuMTAyIDguNzY0LTI0IDExbC0yLjM0NC42ODRjLTUuOTc1IDEuNTI1LTEyLjAyMyAxLjU1My0xOC4xNTYgMS42MjlsLTIuNzIuMDU0LTIuNTYxLS4wMDQtMi4zMTUuMDFMMTM4NiA3MjFjLTIuMDczLTMuMTEtMi42MTItNS4wMzUtMi40OTYtOC43NTQgMS42NjctNy41NDcgOC42MTYtMTIuMzMgMTQuNjMzLTE2LjQzNyA0Ljk0Mi0zLjEyMiAxMC4xMDQtNS43MDYgMTUuMzYzLTguMjQ2bDMuMjIzLTEuNjRjNS4xNjctMi41MDcgOS45NTEtNC40OTEgMTUuMzkyLTQuMzY2bS03MC44NyAzMy4zMzhxLjg3Ny4wMjMgMS43NTUuMTA1YzIuNSAxLjUgMi41IDEuNSA0IDQgMS40NTUgNy44NTktMi4xMTQgMTUuMjgtNiAyMi05LjI3OSAxMy4zNC0yMy45NTMgMTkuOTg0LTM5IDI1LTIuMDE4LjEyLTQuMDQuMTc1LTYuMDYzLjE4OGwtMy4yMjIuMDQyQzEzMTAgNzY2IDEzMTAgNzY2IDEzMDggNzY0Yy0uNzc1LTYuMDUxLjE0MS05LjExOCAzLjgwOS0xMy45MzZsMS42MjktMi4wMDEgMS42NjItMi4xMTZjMTAuMzg4LTEzLjAyOSAyOC4wMjMtMzEuNTMgNDYuMTQ0LTMxLjA1MnptMTMyLjEwOSA2MC45NzRxLjgyMyAwIDEuNjQ2LjEzMWMyLjkyMyAxLjgzMSA1LjQzMyAzLjg2NiA3IDcgLjY1NyA3LjYwOC45NDcgMTQuODAyLTQgMjEtNS43NDUgNS45NDgtMTQuMzc4IDguMDMtMjIuNDM4IDguMzc1LTMuNTYyLS4zNzUtMy41NjItLjM3NS02LjEyNC0xLjMxMy0yLjA1Ny0yLjk1LTEuODAyLTQuOTg0LTEuMjMxLTguNDcyIDIuODcyLTkuMzggMTMuOTc3LTI2LjczNiAyNS4xNDYtMjYuNzJ6bS01NC43NDMgMS44NmMzLjc1OC4wNjYgNi42OTMgMS42ODQgMTEuMzg5IDQuMjcxIDIgMyAyIDMgMS45MzggNi4zNzUtMS43IDYuNTcxLTYuNjU0IDkuMjc4LTEyLjE2OCAxMi42MS01LjQ5OSAzLjE1NS0xMS41OTUgMy4wNTktMTcuNzcgMi4wMTUtNy4xOTgtMi4wOTMtMTQuMTIyLTUuMDM5LTIxLTh2LTJjMjIuNzk5LTExLjE4NyAzMS4zNDgtMTUuMzgzIDM3LjYxMS0xNS4yNzFtMTE2LjU1MyAxNi4yNzljOC42NTUtLjEyOCAxNy44MjUgMi42NDkgMjYuOTk2IDcuNTUgMy4zNzcgMi42NDcgNC42NjcgNS4zNyA1LjM0NCA5LjU3LjE1IDguODQ1LTEuMjA0IDE1LjYzNS02LjUwNCAyMi44NzItNi4wNCA0LjYyNy0xNC42OTQgMy45MDQtMjIgMy02LjEzMi0xLjE4OC0xMi4wNzUtMy4wNDctMTgtNWwtMy40MS0xLjExN2MtMTEuMjgtMy45MTctMTEuMjgtMy45MTctMTQuNTktOC44ODMtLjc0Ny00LjY2Ny0uMDA0LTcuNTIxIDIuNDM4LTExLjQzOCA4LjMyNC0xMS40MjQgMTguNTk5LTE2LjM5IDI5LjcyNi0xNi41NTRtLTI1Ni43MDkgNC41ODIgMy45ODMuMDM1IDMuOTctLjAzNSAzLjgzOC4wMTIgMy40OS4wMWMzLjg0NC40NTYgNy40NTIgMS41NzYgMTAuMjY0IDQuMzg4Ljc4IDMuOTkuNTc2IDUuOTk3LTEuNDY5IDkuNTU5LTE5LjQ1MSAyNy4yMS0xOS40NTIgMjcuMjEtMjkuNDA2IDI4Ljk0MS0zLjU1My0uNTY5LTQuNzg4LTEuNTg4LTYuODk4LTQuNDYtNS4zNjktOC45MjUtOS45OS0xOS40NDQtOC4yMjctMzAuMDQgNC4zOTQtNS45IDkuMzU0LTguMzc3IDE2LjYyMS04LjM5OHptLTY2LjYzNSA5Ljk2YzUuMjUzLjAwNyAxMC41NDggMS4zODggMTQuOTQ2IDMuOTMgOC4xMTcgNS41MiAxMi4zNiAxMy4yMzQgMTcuMTMyIDIxLjU5MmE1NjkgNTY5IDAgMCAwIDMuMjMgNS41NjlxMi40NDkgNC4xNzMgNC44NzIgOC4zNTljLTMuOTQ2IDQuNzMtMTAuMzgyIDYuMDE2LTE2IDhsLTIuNzYyLjk4OGMtNS4yOTYgMS43NTUtMTAuNjg5IDMuMzY0LTE2LjIzOCAyLjAxMi05Ljc1LTUuNTMzLTE2LjI1OS0xNy4yMzUtMjEuNTYzLTI2LjgxM2wtMS4wNS0xLjg0N2MtMi4yNi00LjI2LTIuODgtNy41NTItMi4zODctMTIuMzQgNC41NTgtNi41MzMgMTIuMTQzLTkuNDU5IDE5LjgyLTkuNDVtMzk2LjUwNCA2MS43MzVjMy4zMDcuMDU5IDYuNjAxLjY4NSA5LjQ1MyAxLjg0OCA0LjQ3MSAyLjg0MiA4LjEyMiA1LjkzMyAxMC4yMjMgMTAuODY3Ljg2MSA2LjQyLjc4IDEyLjY0NS0yLjYyNSAxOC4zMDktMy4zOTYgNC4xNzctNi45MzcgNi4zMi0xMi4yODEgNy4xMzItOS44MzYuMzg1LTE1LjE1OC0yLjY1LTIyLjU5NC04Ljc1NC00LjM1Ni00LjEtNC4zNTYtNC4xLTUuMzc1LTguMjUgMi4xMTYtOC4zMSA2LjM3LTE0Ljg3OCAxMy42NzYtMTkuNjAxIDIuODk5LTEuMTAyIDYuMjE3LTEuNjEgOS41MjMtMS41NXptLTIyNC44NjEgMzIuMDU1Yy43ODMtLjAwOSAxLjYxMi4wMzggMi41MTcuMTIgMi45MTguNzggNC4zIDIuMTAyIDYuMDIgNC41NCAyLjYxOSA1LjIzNyAxLjEwMyAxMS40NTItLjYyNSAxNi43NS0xLjk2NCA0Ljk0LTMuNzM5IDcuNi04LjM3NSAxMC4yNS0yLjYyNS4xMjUtMi42MjUuMTI1LTUtMS00LjUyLTQuNjQ5LTYuMzAyLTkuMzktNi41NjMtMTUuODEzLjExMi01LjY0NiAxLjM3Ni04Ljg2NCA1LjQyMi0xMi44MTIgMi4zMjItMS40OSA0LjI1NS0yLjAxIDYuNjA0LTIuMDM1bS03My43NjQgMTMuNDY5YzkuMjI1LjUzNSAxNy43MzEgNS45NjkgMjQuMzAxIDEyLjE5MSAyLjk3NyAzLjQxMyA0LjIyOSA1Ljc5MyA0LjQzOCAxMC4yNUwxMzU4IDk0MmMtMy4wODMgMi4wNTUtNC45NDMgMi42MDUtOC42MjUgMi41MDQtOS42MTEtMi4wNC0xNy41MTMtMTAuNzA1LTIzLjQzOC0xOC4wNjctMS4zMTUtMy40Mi0uNzQ4LTUuOTIuMDYzLTkuNDM3IDEtMSAxLTEgMy43LTEuMTkxek0xNDQ2IDkxOWM2LjgzNSAxLjQ3NCA5Ljk1NyA0LjA4MiAxNC4wNjMgOS45NDVBNDA4IDQwOCAwIDAgMSAxNDY2IDkzOWwxLjYyNSAyLjhjMy42OTEgNy4wNzkgNC43OTEgMTQuMjkgMy4zNzUgMjIuMi0yLjE3IDMuMzQ5LTMuMTkgNC43My03IDYtOC4zMTMgMS40MTUtMTQuNjM0LTMuOTY3LTIxLjE4OC04LjUyLTUuMTUzLTQuMDMyLTguMTEzLTguNTM2LTkuMjYxLTE1LjAxNS0uNjItOS41NzIgMy43NTctMTcuNTUgOS44MjQtMjQuNzE1em00MiAyNGMzLjc2LjEwNCA0LjkzLjkzIDcuNjI1IDMuNjI1IDUuMzMzIDcuMTMzIDYuMyAxMy41NjIgNS4zNzUgMjIuMzc1LTEuMDIgMi44NjctMS4wMiAyLjg2Ny0yIDUtNC4wMTIuNDc4LTUuNzE2LjE3OS05LjE4OC0yLTQuOTEzLTQuNjE3LTUuOTczLTEwLjA3LTYuMTg3LTE2LjYyNS4xMjUtNC43NC44NzYtOC44NzYgNC4zNzUtMTIuMzc1bS0yNjMuNTcgMjQuMDQ3YzE2LjQ2OC4wNjcgMzIuNjMxIDIuNzg4IDQzLjU3IDkuOTUzIDIgMyAyIDMgMS45MzggNS44MTMtMi40NjggOC4zODctOS43MDEgMTIuMDctMTYuOTMgMTYuMS0xNy42MDMgOS41NDMtMzUuOSAxNi41Ni01Ni4wMDggMTguMDg3bC0zLjE1Ni4yODVjLTYuODg4LjM2MS02Ljg4OC4zNjEtMTAuOTAzLTIuMzUxLTMuMjk1LTIuOTc0LTUuMDktNi4zMjItNi45NDEtMTAuMzA5bC0xLjAwOC0yLjEwMmMtOS4wODItMTkuMjExLTkuMDgyLTE5LjIxLTguOTAyLTIzLjg0My45MS0xLjY4LjkxLTEuNjggMi43My0yLjY1N2wyLjMwNS0uNjQ4IDIuMjU4LS42NjRMMTE3NiA5NzRsMy4wMjMtLjk4NGMxMi4xNjQtMy40NSAyOC45MzgtNi4wMzYgNDUuNDA3LTUuOTd6bTQwNy44MjYgNjAuMTc0YzcuNTY2LS4wMyAxNC43NiAxLjcgMjAuNzQ0IDUuNzc5IDIuOTEgMy45MjQgMy42NTEgNi44NzYgMy40NzcgMTEuNjY4LS44ODcgNC4zMzctMy41MzcgNy4xNS02LjQ3NyAxMC4zMzJsLTEuNjA1IDEuODQ0Yy03LjY1MiA4LjI4Ny0xOC4xMjIgMTQuMDA1LTI5LjQ4IDE0LjU5YTIxMiAyMTIgMCAwIDEtNS4yOS4wMDRsLTIuOC0uMDI2Yy0xMS4zMjYtLjI4LTE5LjUzOC0zLjU2Mi0yNy44MjUtMTEuNDEyLTIuMTY0LTMuMjQ2LTIuNTI1LTQuMjM0LTItOCAxMC4xNTktMTMuMTUgMzEuOTItMjQuNzA2IDUxLjI1Ni0yNC43OHptODQuNDQzIDE4LjQwNGMxLjg2Ni4wNCAzLjczMy41NDUgNi4wNDMgMS40NTMgNi44NTMgMy4xNzQgMTYuNzI4IDcuODYyIDIwLjI1OCAxNC45MjIuNTc4IDUuODU0LS40NzQgOC41MTMtNC4xMjUgMTMuMDYzbC0xLjMxOCAxLjY0OGMtMTMuOTM2IDE2Ljk4LTEzLjkzNiAxNi45NzgtMjAuNTU3IDIwLjI4OS0xNC4zMzMtLjA5My0zMS44NTktMS4yNDctNDIuNjI1LTExLjUtMS4zNzUtMi41LTEuMzc1LTIuNS0xLjM3NS00LjkzOCA1LjgwMy0xNC44NyAyMy44ODgtMjYuNjUyIDM3LjY2LTMzLjU5IDIuMzA4LS45NTkgNC4xNzMtMS4zODYgNi4wNC0xLjM0N3ptLTQyNC4xOTkgMjUuOTM4YzcuOTc3LjE1MiAxNC4zMDcgMi43ODYgMTkuODc1IDguNTYyIDguNjAyIDExLjUzNCA3LjkwNiAyNi4wODIgNi4xMTcgMzkuNzU4LS45NDYgNC40MjYtMS45MDEgNy4zNzktNC43NDIgMTAuOTMtMy44NjkgMS42Ny01Ljc0NiAxLjUyMi05Ljc1LjE4Ny0xMy4wMDctMTAuNDQzLTE2Ljk3My0zMy4zMTQtMTktNDktLjE3OC0yLjcyOS0uMTUtNS4yNTQgMC04IDIuNjA5LTIuNjA5IDMuODYyLTIuMzU4IDcuNS0yLjQzOHptMTE4LjU4NiA5LjIxOGMuNjc2LS4wMTMgMS40MDcuMDM4IDIuMjI2LjAzMiAxMS43MDguMTY1IDI1Ljc4NSAyLjU4NSAzNS42ODggOS4xODctMS41OCA0LjQ0NC0zLjg3OSA4LjMzNi02LjM3NSAxMi4zMTNsLTEuMzEgMi4wOTNjLTMuMzU4IDUuMjczLTYuOTQzIDEwLjM0Mi0xMC42OSAxNS4zNDRsLTEuNTE0IDIuMDIyYy0yLjUxOSAzLjMwNy01LjA3IDYuMzc0LTguMTExIDkuMjI4LTEyLjYxMi0zNi43Ny0xMi42MTItMzYuNzctMTMtNDkgLjk4NC0uOTg0IDEuOTYtMS4xOTQgMy4wODYtMS4yMTltLTU1LjAzIDExLjAxNGM1LjU2LjAwNSA5Ljk1NiAxLjM5NyAxNC45NDQgNS4yMDUgNC42NjYgNC4zOTIgNi43MzggNy42MzYgNy4yMzggMTQuMDU5bC4wNzQgMy4zNzkuMTE0IDMuMzdjLS41MTggMy44NzktMS42MzQgNS40OTUtNC40MjYgOC4xOTItMy4zMTMuMzc1LTMuMzEzLjM3NS03LTEtNy41MTUtNi45NjUtMTMuMjczLTE4LjIyOS0xNi0yOCAuMzc1LTIuODc1LjM3NS0yLjg3NSAxLTVhNDMgNDMgMCAwIDEgNC4wNTctLjIwNXoiLz48L3N2Zz4=", "ps": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDYgMyI+PHBhdGggZmlsbD0iIzAwOTYzOSIgZD0iTTAgMGg2djNIMHoiLz48cGF0aCBmaWxsPSIjRkZGIiBkPSJNMCAwaDZ2MkgweiIvPjxwYXRoIGQ9Ik0wIDBoNnYxSDB6Ii8+PHBhdGggZmlsbD0iI0VEMkUzOCIgZD0ibTAgMCAyIDEuNUwwIDNaIi8+PC9zdmc+", "tr": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9IjgwMCIgdmlld0JveD0iMCAtMzAwMDAgOTAwMDAgNjAwMDAiPjxwYXRoIGZpbGw9IiNlMzBhMTciIGQ9Ik0wLTMwMDAwaDkwMDAwdjYwMDAwSDB6Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0ibTQxNzUwIDAgMTM1NjgtNDQwOC04Mzg2IDExNTQxVi03MTMzbDgzODYgMTE1NDF6bTkyNSA4MDIxYTE1MDAwIDE1MDAwIDAgMSAxIDAtMTYwNDIgMTIwMDAgMTIwMDAgMCAxIDAgMCAxNjA0MnoiLz48L3N2Zz4=", "iq": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5MDAiIGhlaWdodD0iNjAwIiB2aWV3Qm94PSIwIDAgMTE4ODAgNzkyMCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgMGgxMTg4MHY3OTIwSDB6Ii8+PHBhdGggZmlsbD0iI2NkMTEyNSIgZD0iTTAgMGgxMTg4MHYyNjQwSDB6Ii8+PHBhdGggZD0iTTAgNTI4MGgxMTg4MHYyNjQwSDB6Ii8+PHBhdGggZmlsbD0iIzAxN2IzZCIgZD0iTTU4NjQgNDUxNUgzOTI5YTI4OCAyNDggMCAwIDEtMzY1IDIxNWMyNzEtMTMzIDI1NC0yNjggODMtNTY4IDk1LTM0IDExMC00MyAyMDYtMTA4LTY4IDIwNiAxNzYgMTgxIDM1NiAxODEgMC03MiA3LTE1NC00Ny0xNjUgNzAtMjUgNzYtMzMgMTg3LTEyN3YyNzdoMTMzNXYtMTkwYTQwIDQwIDAgMCAwLTgwIDB2MTEwYTMwIDMwIDAgMCAxLTMwIDMwSDQ1NTR2LTE4MGw3NjYtNzQwYy01IDM4IDc0IDE0MCAxMDcgMTU3LTI1IDQtNTMtMS03MSAxN2wtNjI3IDYwNmg2OTVjMC0xNjEgMTUwLTE2MSAyMjAtMjE4IDcwIDU3IDIyMCA1NyAyMjAgMjE4em0xNDUgMFYzMjUwYzcxIDM5IDEyNiA4NCAyMTQgMTA2LTQgNTAtNDkgNjYtNDkgMTAxdjc3OGM5OCAyMiAxMjAtMzUgMTY3LTY0IDEyIDEyNCA5MSAyNDYgODggMzQ0em0xMzIyLTg0NSAxNTUtMTMwdjY4MGgxMTB2LTc3M2M1NC00NSAxMjQtOTQgMTU1LTE1MXYxMjE5aC05NzVjLTE0LTI1Mi0xNC01MTEgMjgwLTQ1NXYtMTAzYzAtMjQtMzYtNS0zNi0yN2wyMDEtMTY4djQ1OGgxMTB6bS01MS0zNDhjLTE5IDEtNDgtMTAzLTQxLTEyMyA3LTIzIDMzLTIzIDQ0LTEyIDE4IDE3IDE2IDEzNC0zIDEzNXptLTE4MSAxNDFjLTU1LTMyLTQ2LTQ1IDItMzEgODMgMjUgMTI1IDQgMTg1LTU3bDQ1IDIzYzU5IDMwIDk1IDE3IDExNi01NSA2LTIyIDI0LTE2IDI5IDkgMTkgMTAwLTU3IDEzMS0xMzQgMTAzLTQyLTE0LTQ5LTE0LTcwIDItNDYgMzYtMTEyIDQyLTE3MyA2em03OTcgMTA1MlYzMjUwYzcxIDM5IDEyNiA4NCAyMTQgMTA2LTQgNTAtNDkgNjYtNDkgMTAxdjc3OGM5OCAyMiAxMjAtMzUgMTY3LTY0IDEyIDEyNCA5MSAyNDYgODggMzQ0em0tMzc5MSAxNDBhMSAxIDAgMCAxIDExOCAwIDEgMSAwIDAgMS0xMTggMHptMjg2MS00NjBhNDUgMzQgMCAwIDAgOTAgMCA0NSAzNCAwIDAgMC05MCAweiIvPjwvc3ZnPg==", "eg": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCI+PHN0eWxlPi5Ce2ZpbGw6I2MwOTMwMH0uQ3tzdHJva2U6bm9uZX0uRHtzdHJva2U6I2MwOTMwMH0uRXtzdHJva2UtbGluZWpvaW46cm91bmR9LkZ7c3Ryb2tlLXdpZHRoOjUuNDQ4fTwvc3R5bGU+PGRlZnM+PGNsaXBQYXRoIGlkPSJBIj48cGF0aCBkPSJtLTEwOS40NDkgMTgxLjUyOC0uMjI0LjAwN2MtMS42NDIgMC01LjQ1NS0uODQyLTYuOTI1LTIuMTA1LTEuNTQgMS4xNjctNS40MTYgMi4xMDUtNy4wMzIgMi4xMDVhMS4yMiAxLjIyIDAgMCAxLS4yMjUtLjAyM2wuMDM4IDEuMDk2Yy4wODUgMS4yOTcuMzEzIDIuNTk4LjY1OCAzLjg1IDEuMDg3IDMuOTQxIDMuMzEyIDcuMjkgNi41MDEgOS44MzEgMy4xOTItMi41NDMgNS40Mi01Ljg5NSA2LjUwOS05LjgzOWExOS4zNiAxOS4zNiAwIDAgMCAuNjYtMy44NSAyMS4zMyAyMS4zMyAwIDAgMCAuMDM5LTEuMDczeiIgZmlsbD0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIuMjQyIiBjbGFzcz0iRCIvPjwvY2xpcFBhdGg+PHBhdGggaWQ9IkIiIGQ9Ik0tMTIzLjk3NiAxNzkuMjZoNC44ODN2MTcuMTk4aC00Ljg4M3oiLz48L2RlZnM+PHBhdGggZD0iTTAgMGg5MDB2NjAwSDB6Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgMGg5MDB2NDAwSDB6Ii8+PHBhdGggZmlsbD0iI2NlMTEyNiIgZD0iTTAgMGg5MDB2MjAwSDB6Ii8+PGcgdHJhbnNmb3JtPSJtYXRyaXgoLjIzMzEgMCAwIC4yMzMxIDM0NC4xNCA5Ny40MzQpIiBmaWxsPSIjZmZmIiBjbGFzcz0iRCI+PHBhdGggZD0ibTQ1Ny42MDIgODc5LjM0NCAyOTMuODIyIDI3Mi43NjItMjAuOTE4LTQ5NS4zOGMtMy4wNzMtNzUuMDc4LTY4LjMxNi01Ny44NTMtMTE1LjcwOS0zMC43Ny00OC4wMSAzMC43Ny0xMDIuNzgzIDMwLjc3LTE2MC42NDggMTAuNDU0LTU3Ljg1MiAyMC4zMTUtMTEyLjYyOSAyMC4zMTUtMTYwLjY0LTEwLjQ1NS00Ny4zODgtMjcuMDgtMTEyLjYyNC00NC4zMDgtMTE1LjcwNCAzMC43N2wtMjAuOTMxIDQ5NS4zODF6IiBzdHJva2Utd2lkdGg9IjUuNDUiIGNsYXNzPSJFIi8+PHBhdGggZD0ibTIxMS42MDYgNjM5LjQ4My0yMC4zMDkgNDgxLjg2Ni0zNC40NzEgMzAuNzUyIDIwLjkzMS00OTUuMzhjOS44NDItNi43NyAyNy4wODQtMTcuMjMzIDMzLjg0OS0xNy4yMzN6bTQxLjI3MSAzNC40OTMtMTcuMjMzIDQwMy4wNzgtMzQuNDU4IDM1LjI2NSAyMC45MjMtNDY1LjQzNWM2Ljc3NCA2Ljc2NiAyNy4wODggMjMuMzgxIDMwLjc2OSAyNy4wNzF6bTM3LjUzOSAzMC43Ni0xMy41MzUgMzM2LjE4Mi0yNy42OTMgMjcuMDcxIDE3LjIzOC0zODMuNTYyYzYuNzUzIDYuNzcgMjAuMjkyIDE2LjYyIDIzLjk5IDIwLjMwOXptNDAuNjI3IDE3LjI0Ni0xMy41NCAyODYuNTI0LTI3LjA4NCAyMS45NjUgMTMuNTQtMzE4Ljk0OWM2Ljc3NCAzLjA3NiAyMC4zMTQgMTAuNDU5IDI3LjA4NCAxMC40NTl6bTM3LjUzOSAwLTkuODU0IDIzOC43NzUtMjcuNjkzIDI3LjA4NCAxMC40NjgtMjYyLjc3OGM2Ljc1NyAwIDIzLjk5NSAwIDI3LjA3OS0zLjA4eiIgaWQ9IkMiIGNsYXNzPSJCIEMiLz48dXNlIHRyYW5zZm9ybT0ibWF0cml4KC0xIDAgMCAxIDkwOC4yNTQgMCkiIHhsaW5rOmhyZWY9IiNDIi8+PHBhdGggZD0ibTQ2Ny42ODQgOTMzLjY1NyA0MS4yNCAxODcuNzE1LTEzLjU0NyAxMy41MzYtMTQuMTU0LTEwLjQ2My0yMy4zOS0xNjcuMzkyIDkuODQ5IDE2Ny4zOTItMTMuNTQ0IDE3LjIyOC0xMy41NC0xNy4yMjggOS44NS0xNjcuMzkyLTIzLjM4MyAxNjcuMzkyLTE0LjE2OCAxMC40NjMtMTMuNTMzLTEzLjUzNiA0MS4yMzMtMTg3LjcxNmgyNy4wODd6IiBzdHJva2Utd2lkdGg9IjQuNjA3IiBjbGFzcz0iQiIvPjxnIGlkPSJEIiBmaWxsPSJub25lIiBjbGFzcz0iRCBFIj48cGF0aCBkPSJtMzYxLjgwNCA4NTEuMjAxLTgxLjg1NiAyOTAuNDYzIDExMi42MzcgMTcuMjM2IDQ3Ljk5OC0yMTguNDctNzguNzgtODkuMjN6IiBmaWxsPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUuMTAxIi8+PGcgY2xhc3M9IkYiPjxwYXRoIGQ9Im0zMzQuNzMzIDk1MC4zMDMgOS44NDggMjMuOTk0IDUzLjIxOS01MC44MyIvPjxwYXRoIGQ9Im0zNzEuNTg1IDg5MC4xNTYgMTEuMTM2IDEwNC40NDcgMzMuODUxLTQ0LjMwOW0tMTMuNTQgMTcuMjEyIDE4LjQ5IDYzLjgxNm03LjI1LTIzLjQ0Ni0zNy40IDU2LjgwNm0xMS42NjUgNTYuNjk4LTExLjk3LTU2LjYyLTEwLjQ1LTU3LjU4Ny0yNS4wNTYgMzMuOTMtMTAuOTg5LTM5LjEyMS0zNS4wNyAzNS45NzEgMTcuODM2IDY1LjQyOSAyNC42MTUtNDAuNDc3IDEzLjUzOCA0MS4yMzggMjUuMjctMzkuMzA3bS04Ni44MzEgNzAuMDcxIDIyLjczNi0zMS45MzQgMTQuODEzIDQ5LjE1MiAyMC4zMS0zNC40NiAxMy41NDcgNDEuMjQ0Ii8+PC9nPjwvZz48dXNlIHRyYW5zZm9ybT0ibWF0cml4KC0xIDAgMCAxIDkwOC4yNTQgMCkiIHhsaW5rOmhyZWY9IiNEIi8+PGcgY2xhc3M9IkUiPjxwYXRoIGQ9Ik00NTQuMTI3IDEyNzEuNTA1Yzg1LjU1OCAwIDE2Ny40MTgtNi43NjkgMjE1LjQyLTIwLjMxIDIwLjMxNi0zLjY4NCAyMC4zMTYtMTQuMTQ3IDIwLjMxNi0yNy42OTQgMjAuMzE1LTYuNzY4IDkuODQ1LTMwLjc2MiAyNC0zMC43NjItMTQuMTU1IDMuNy0xNy4yMjgtMjQtMzQuNDYyLTIwLjI5OSAwLTI0LjAxLTI0LjAwNi0yNy4wODMtNDQuMzE3LTIwLjMyNS00MC42MjYgMTMuNTQ2LTExMi42MzcgMTYuNjI1LTE4MC45NTggMTYuNjI1LTY4LjMxNi0zLjA3OS0xMzkuNzE2LTMuMDc5LTE4MC45NTMtMTYuNjI1LTIwLjMxLTYuNzU4LTQ0LjMwNC0zLjY4NS00NC4zMDQgMjAuMzI1LTE3LjIzOS0zLjctMjAuMzE1IDI0LTM0LjQ2NyAyMC4zIDE0LjE1MiAwIDMuNjg3IDIzLjk5MyAyNCAzMC43NjEgMCAxMy41NDcgMCAyNC4wMSAyMC45MjYgMjcuNjk0IDQ3LjM4NSAxMy41NDEgMTI5LjI1MyAyMC4zMSAyMTQuNzk4IDIwLjMxeiIgc3Ryb2tlLXdpZHRoPSIxMC4yMDIiLz48ZyBjbGFzcz0iRiI+PHBhdGggZD0iTTMzNy44MjIgMTE0MS42NDJjMjcuNjkgMy42OTUgNTguNDY2IDYuNzY5IDgyLjQ3OCAzLjY5NSAxMy41MjggMCAyMy4zNzggMjMuMzgzLTMuNzAxIDI3LjA4My0yMy45OTUgMy4wNjgtNjEuNTQyIDAtODEuODU2LTMuNy0xNy4yMzMtMy4wNzgtNTQuNzc2LTkuODQ0LTc4Ljc4My0xNi42MjUtMjQuMDAzLTEwLjQ1Mi02Ljc2Mi0zMC43NTEgNi43NjYtMjcuNjggMjAuOTMxIDYuNzY1IDQ4LjAxNSAxMy41NCA3NS4wOTkgMTcuMjI4em0yMzIuNjUzIDBjLTI3LjcgMy42OTUtNTguNDY2IDYuNzY5LTgxLjg2IDMuNjk1LTE0LjE2IDAtMjQuMDA4IDIzLjM4MyAzLjA3NyAyNy4wODMgMjQuMDA1IDMuMDY4IDYxLjU1IDAgODEuODQ3LTMuNyAxNy4yNDItMy4wNzggNTQuNzgtOS44NDQgNzguNzg0LTE2LjYyNSAyNC4wMS0xMC40NTIgNi43OC0zMC43NTEtNi43NjctMjcuNjgtMjAuOTI2IDYuNzY1LTQ4LjAwNiAxMy41NC03NS4wODEgMTcuMjI4eiIvPjxwYXRoIGQ9Ik0yNTIuODc3IDExMjguMTI5Yy0yMC45MjMtMy42OTUtMzAuNzcgMjAuMjk5LTIzLjk5MyAzMy44MzUgMy4wNzMtNi43NjggMTcuMjMtNi43NjggMjAuMzEyLTEzLjUzNiAzLjY4MS0xMC40NTUtMy4wODItMTAuNDU1IDMuNjgxLTIwLjN6bTgxLjg1NiA2Mi45MzZjMC0xMy41MjYgMTMuNTMzLTExLjg2MyAxMy41MzMtMjUuNDA0IDAtNi43NjYtMy42ODUtMTcuMjM0LTEwLjQ1NC0xNy4yMzRzLTEzLjU0NiA2Ljc2OC0xMy41NDYgMTMuNTM2Yy0zLjA4IDEzLjU0NCAxMC40NjcgMTUuNTc4IDEwLjQ2NyAyOS4xMDJ6bTk3LjQyOS0zOC45NTVjMjAuMjk0IDAgMTguMjgzIDI3LjA4OSA4LjQzMiA0MC42MjcgMC05Ljg0Ni0xNy4yMy0xMy41MzgtMTcuMjMtMjAuMjk5IDAtMTAuNDc2IDE1LjU1Ni0xMC40NzYgOC43OTgtMjAuMzI4em0yMjMuMjE1LTIzLjk4MWMyMC45MjYtMy42OTUgMzAuNzc4IDIwLjI5OSAyNC4wMDQgMzMuODM1LTMuMDgtNi43NjgtMTcuMjMzLTYuNzY4LTIwLjMxLTEzLjUzNi0zLjY5NC0xMC40NTUgMy4wOC0xMC40NTUtMy42OTQtMjAuM3ptLTgxLjg1NSA2Mi45MzZjMC0xMy41MjYtMTMuNTI4LTExLjg2My0xMy41MjgtMjUuNDA0IDAtNi43NjYgMy42ODctMTcuMjM0IDEwLjQ1OS0xNy4yMzQgNi43NjYgMCAxMy41NCA2Ljc2OCAxMy41NCAxMy41MzYgMy4wOCAxMy41NDQtMTAuNDcxIDE1LjU3OC0xMC40NzEgMjkuMTAyem0tOTcuNDMtMzguOTU1Yy0yMC4zMDIgMC0xOC4yODggMjcuMDg5LTguNDQgNDAuNjI3IDAtOS44NDYgMTcuMjI4LTEzLjUzOCAxNy4yMjgtMjAuMjk5LjAwMy0xMC40NzYtMTUuNTU2LTEwLjQ3Ni04Ljc4Ny0yMC4zMjh6Ii8+PC9nPjxwYXRoIGQ9Ik0yNTkuNjU2IDExMzQuOTA3YzYuNzc4IDAgMTcuMjM2IDMuMDc5IDIwLjMxNSA2Ljc2NmwtMjAuMzM1LTYuNzc5em0zMy44MDYgMTAuNDY4YzMuNjk3IDAgMTcuMjM5IDMuMDczIDI0LjAwNyA2Ljc1OGwtMjQuMDI1LTYuNzc5em0xMjMuMTI3IDEzLjUxNGMtNi43NjkgMC0yMC4zMSAwLTIzLjk5NCAzLjA2OGwyMy45ODItMy4wODl6bS0zNy41MzkgMGMtMy42ODQtMy43LTE3LjIzMS0zLjctMjMuOTk3IDBoMjMuOTgyem0yNjkuNTkyLTIzLjk4MmMtNi43NjkgMC0xNi42MjMgMy4wNzktMjAuMzE2IDYuNzY2em0tMzMuODUgMTAuNDY4Yy0zLjY5IDAtMTcuMjM0IDMuMDczLTI0LjAwNCA2Ljc1OGwyNC4wMjQtNi43Nzl6bS0xMjMuMTI2IDEzLjUxNGM2Ljc3NiAwIDIwLjMxNCAwIDI0LjAwNCAzLjA2OGwtMjQuMDI0LTMuMDg5em0zNy41MzggMGMzLjY5LTMuNyAxNy4yNC0zLjcgMjQuMDA1IDBoLTI0LjAyNXoiIHN0cm9rZS13aWR0aD0iMy44MjIiLz48L2c+PHBhdGggZD0iTTI1My45NSAxMTg5LjAwNmMtMi4yOTEtLjQzOC0zLjQ5NC0yLjI1MS0yLjkxOC00LjM5Ni43MDMtMi42MTMgMi43OTYtNC4xMDggNC43NzMtMy40MDggMS4yNTguNDQ0IDMuNTYgMi43NjUgMy41NyAzLjU5OC4wMTIuOTU2LTEuMjA1IDMuMjI5LTEuNzI4IDMuMjM0LS4yMjYuMDAyLS41NzYuMi0uNzc4LjQzNy0uNDI5LjUwNy0xLjc3My43NTMtMi45MTkuNTM0em0yMzUuNjU2IDE2LjgxN2MtLjg1Mi0uMzE2LTIuMjEtMi4yMjUtMi4yMDgtMy4xMDUuMDA4LTEuNjYxIDIuNDYzLTQuMzY3IDMuOTg0LTQuMzgyLjc1Mi0uMDA1IDIuODEgMS4wNjQgMy41NzkgMS44NjQgMS4zOTQgMS40NSAxLjA5IDMuODMtLjY2MiA1LjE4Mi0uODYyLjY2Ni0zLjQzMy45MDctNC42OTIuNDR6bTEuNTQ1IDEwLjYzOWMtMS44MDMtLjYxLTIuNDYyLTEuNDkyLTIuNjA5LTMuNDktLjE1Mi0yLjA4My4wNS0yLjQwNyAyLjI1LTMuNjA3bDEuNTY5LS44NTUgMS40ODYuNjYzYzIuMDYuOTE4IDIuOTc1IDEuOTA4IDMuMDQ4IDMuMjkyLjA3OCAxLjQ5Mi0xLjAyOSAzLjAxOC0yLjc0NyAzLjc4OC0xLjUwOC42NzYtMS41OTguNjgyLTIuOTk3LjIxem0tMjE4LjI4Mi00Ni43MTljLTEuNDg1LS4wNDctMy41MjMgMS4zMTgtNC42OTIgMi4wMS0yLjc4NS42NTQtNi4wMjYgMi4zNjUtOC43MTQuNTM3LTIuNjQ4LS44MTgtNi4xNy0uMTczLTYuNTcgMy4wODQuNjggMi43OTYgNC41OTggNC4zOTQgNi45NzIgMi41NDcgMS43NjItMi4zMDYgNi41Ny0zLjY1OSA3LjEwNS4yNjgtMS45NiAyLjk3LTEuNzM3IDYuOTAyLTMuMzUxIDEwLjA1NS0uMjYzIDEuOTY0LTEuMDggMy44MjktMi4xNDUgNS40OTctMS45ODMuMTk5LTQuMDkyLS4wMzUtNS43NjUgMS4yMDYtMi42ODYuMTQ3LTUuNDI2IDEuNDgyLTYuOTcyIDMuNzU0LTEuNzMgMi40OC0zLjM4MyA1LTMuODg4IDguMDQ0LjQ2IDMuMTEgNC4wMjIgNC4wMDIgNi43MDQgNC4xNTYgMi44Ni43ODggNS43MjQgMS44MiA4LjU4IDIuNjgyIDQuNjU2IDEuMDQyIDkuMDE4IDIuNzI1IDEzLjY3NSAzLjc1MyA2Ljc5NyAyLjA1IDEzLjkzNCAyLjk5MiAyMC43OCA0LjgyNy43MTguMjM4IDEuMzkuNDQ1IDIuMTQ1LjUzNiAyLjg0Mi41OSA0LjMyNC0yLjUgNC41NTgtNC44MjYgMS40MS00Ljk3NSAyLjQ4Ni0xMC4wMzUgMy44ODgtMTUuMDE2Ljk2NS0xLjk5NyAyLjEzLTYuNTA5LTEuNzQyLTUuNDk2LTIuMjEgMS4zMjQtNC4wODQgMy4zMTgtNi44MzggMy40ODUtMy43NS4yMTktMS42MSA0LjA1NS0uMTM0IDUuNjMxLjMyNiAyLjUyLS40NzEgNS41My0yLjE0NSA3LjUwOC0yLjIzIDEuNDE0LTUuMDI2LS4yNC03LjM3NC0uODA0LTIuNDY1LjA0Mi03LjM5My0xLjIxNi01LjA5NC00LjU1OS44MTYtMi40NzUuODg4LTUuMTgzIDEuODc3LTcuNjQxIDEuMjU5LTIuNjM3IDEuNDM5LTUuNTE0IDIuMDEtOC4zMTItMS41NS0zLjMzNS00LjE5OCAxLjA5Ny02LjMgMS40NzQtMS40NSAxLjAwNy02Ljg4OCAxLjQzNC00LjAyMyA0LjAyMiAyLjQ2OCAxLjg3NS41NzYgNS4xMzQuMTM0IDcuNTA4LS4xNTggMy4zMDQtMy41OTQgNC4wOTMtNi4zMDEgMy4zNTItMi42OTMtLjEzLTYuNDQxLTIuMTM1LTQuMTU2LTUuMDk1LjUyLTIuNDY3IDEuMzgxLTQuODkxIDEuODc3LTcuMzc0bDIuOTUtOC44NDhjLjQ2NS0yLjY2IDEuNDItNS4xODIgMi42OC03LjUwOC4wNzUtMi45NCAyLjA1LTUuNDcgMi4wMTEtOC40NDYtLjItMS40NTQtLjg1MS0xLjk4My0xLjc0Mi0yLjAxMXptLTE1LjQxNyAzMS4xMDNjLjM1LS4wNi42LS4wMDguOTM4LjEzNCAxLjA3MS40NTYgMS4xMDMgMS4zMjcgMCAyLjI4LS40ODIuNDE1LTEuMDMuODE2LTEuMjA3LjgwNC0yLjAwNi0uMTczLTIuNTk4LS40NzEtMi42OC0xLjIwNy0uMDc1LS42NDkuMTMtLjgzNSAxLjQ3NC0xLjQ3NS42NjctLjMxOCAxLjEyNC0uNDc1IDEuNDc1LS41MzZ6bS00LjQ0NiAyMS41MzdjLTIuMTI4LTItMS43ODUtMy40NiAxLjM2MS01LjgwNiAxLjM0Ny0xLjAwMyAyLjE2My0uODkgMy43MDMuNTE1IDIuMzcgMi4xNjIgMi40NjUgMy41My4zNzMgNS4zODMtMS4wMzQuOTE2LTEuNDg2IDEuMTA0LTIuNjkgMS4xMTYtMS4yNTkuMDEzLTEuNjE2LS4xNDQtMi43NDctMS4yMDh6bTEzLjA4NSAzLjk0N2EzLjY5IDMuNjkgMCAwIDEtMi42Ny00LjY2NmMuNTUtMS44NjUuODctMi4wNDggMy42MDQtMi4wNzYgMy4wNjctLjAzIDMuNjYyLjQ4MyAzLjY5MSAzLjE4My4wMTcgMS41Mi0uMSAxLjg3Mi0uODU3IDIuNTc2LS44ODguODI2LTIuNTk2IDEuMjcxLTMuNzY4Ljk4MnptMzgyLjI5My4zNDNjLS45NzQtLjgxLTEuMTctMS4xNzctMS4xODEtMi4yMDktLjAxMy0xLjc2MSAxLjAwMi0zLjA1MyAzLjItNC4wNDkgMi45MjYtMS4zMjUgNC4xMTgtMS4xNDMgNS4yMi43OTcgMS40NjUgMi41OCAxLjM5NSAzLjYzMy0uMzYgNS4zNzEtLjk2OS45Ni0xLjE1IDEuMDE2LTMuMzY4IDEuMDM4LTIuMTc3LjAxMy0yLjQyNi0uMDQ1LTMuNTExLS45NDh6bS0zNjQuOTE4IDQuOTMzYy0xLjU2MS0uNDE2LTIuMzctMS41ODgtMi4zOS0zLjQ2LS4wMTgtMS40MzMuMDg2LTEuNjYxIDEuMDg3LTIuNDQ1LjY1LS41MDggMS42NzQtLjk0MyAyLjQ4Mi0xLjA1MyAxLjE0NS0uMTU3IDEuNTY0LS4wNTcgMi40ODUuNTkgMi4zNjIgMS42NiAyLjg2NCAzLjMwMyAxLjQ5NiA0Ljg5Ny0xLjQ1NyAxLjY5Ny0yLjgzNyAyLjA5MS01LjE2IDEuNDcxem05NC4wNCA0LjIwNWMtLjM0Ny0uNDMyLTEuMTEyLS42ODctMS4xOTEtMS4yMzIuMTM3LTIuMzguMjUxLTQuNzkgMS4wMS03LjA3LjQxMi0yLjI0NC4wNS00LjU4OC44MzMtNi43NzMuODAyLTMuOTc3LjgwMS04LjA3NyAxLjcyNS0xMi4wMjguMDQzLTIuMDM1LjIzNi00LjA3MS44MjYtNi4wMy42NzYtMy4wOTYuMDU4LTYuMzMzLjk3LTkuMzkyLS4wOTgtMS4xNSAxLjIyNS00LjIxOCAyLjM4Ny0yLjQgMS42ODcgMi40NzMgMy45MSA0LjQ4MyA2LjA5NiA2LjUgMS44NzggMS4wODQuMTU0IDIuNjgtMS4xNDQgMy4yMTctMS43ODEuNzAyLTIuMjE0IDIuNjY0LTIuMDg4IDQuMzg1LS4yNSAxLjc3OS0uOTYzIDMuNDYyLTEuMDM2IDUuMjc3LS4zNzcgMi42Ny0uMzAzIDUuMzgzLS42NSA4LjA1LS43ODEgMi42MTMtLjQ4MiA1LjQwNS0uNzQzIDguMDk4LjAzNCAxLjcxLS43NzggMy4yNjMtLjY2NiA0Ljk3OS0uMjA4IDEuNzQtLjI4NiAzLjgzNi0xLjc0NyA1LjAzLTEuNDEuNzEyLTMuNDUuNTg5LTQuNTgzLS42MTF6bTEyNy40MTYtNDIuMDQ0Yy0yLjA2OSAxLjU2NS0zLjkxOSAzLjQxMi01Ljc2NSA1LjIzLTIuNTQyIDEuOTI1IDIuMDg4IDMuMDQ1IDIuNjgxIDQuNjkyLjY3NSAyLjUxNS42MzUgNS4xOTMuODA1IDcuNzc2Ljc2OSAyLjM2NSAxLjEwOCA0Ljg4NC45MzggNy4zNzQtLjIyMiAyLjY3LTMuNzA0IDIuMTA3LTUuMjI4IDMuNjItMi4xMS44ODgtMi45NTIgMi45NjItNC41NTkgNC40MjMtMS4wNTYgMi4wNzEtMS4zMzkgNC42MTgtMS40NzQgNi45NzIuMTUxIDEuOTIxLTEuMjk4IDQuMDcyIDAgNS43NjUuMTY3LjIzOS4zNjUuNTY2LjUzNi44MDQuNDM0LjYyMyAxLjQ3LjEyNiAyLjE0NS4yNjggMi4xNi0uMTIgNC40MTIuMjAzIDYuNDM1LS42NyA1LjE5MS0uODk4IDEwLjQzLS45NyAxNS42ODYtMS4yMDcgMy4yMTQuMTAzIDYuMzA3LTEuMDE2IDkuNTE5LS45MzggMi41MTcuNTU3IDMuNjUtMi4xNzIgMy42Mi00LjE1Ni0xLjQyNi0yLjgwNC0uMTk0LTYuMTI5LTEuMzQxLTguOTgzLTEuMDA4LTIuODg1LS42MTEtNi4xMjYtMS4wNzMtOS4xMTYtLjA2My0yLjM1My0zLjA0OS0zLjIyNS00LjU1OC0xLjQ3NS0xLjQ2NSAxLjQ4LTMuODMgMS43NzYtNC45NiAzLjYyLTEuMjczIDIuNTg0IDIuNjkxIDIuNTg3IDMuMzUxIDQuNTU4Ljc1NSAxLjk5Mi41MDggNC4yMDcuNjcgNi4zMDEuNDkgMi41NDItMi4yNyAyLjY4Ny00LjAyMSAyLjk1LTIuMzAzLjg2My01LjUzNSAxLjQ0LTYuODM4LTEuMzQtLjgxOS0yLjA1OC0uNzA3LTQuMjYtLjkzOC02LjQzNi0uMDU3LTMuODI2LS45NzctNy41ODctMS4yMDctMTEuMzk1LS4yMi00LjcwNi0xLjAzMy05LjM4MS0xLjM0LTE0LjA3Ny0uMDQ0LTEuOTU0LS4zMDQtNS4xNC0zLjA4NC00LjU1OHptLTIuNjgxIDM1LjM5NCAxLjM0LjEzNC4xMzQgMS42MDkuMTM0IDEuNjA4LTEuNzQzLjUzN2ExNC4yMiAxNC4yMiAwIDAgMS0xLjc0Mi40MDIgMTAuOTQgMTAuOTQgMCAwIDEtLjgwNS0uNTM3Yy0uOTQyLS42OC0uNzAxLTEuNjUxLjUzNi0yLjk0OS42OTgtLjczIDEuMDI1LS44NzIgMi4xNDUtLjgwNHptLTEyOC41NTQtMzkuODEyYy0xLjYzLjU3OS0zLjcgMi45NzMtNS4zNjIgMi45NS0zLjc3Ni4yNjYtMy4yNDkgMy45NDMtLjUzNyA1LjIyOC4zNTggMS4xMTUuMDIyIDIuNTIyLjEzNCAzLjc1NC41MjcgMy4zODctMS42MSA2LjExMy0xLjIwNiA5LjUxOS0uMTkgMy43MzMtMS4zMTcgNy4zNjktMS40NzUgMTEuMTI3LTEuMDYgMy44NzYtMS4wNzIgNy44Ni0xLjc0MyAxMS43OTgtLjQ0NyAzLjUzMi0zLjAwMSAyLjI4Ni01LjIyOSAxLjM0MS0uMDE3LTEuNTMxLS4xMTYtMy4wMjctLjEzNC00LjU1OC45MjktMy41MDYtMS44OTItNC41MjktNC42OTItNC45Ni0yLjk0NC4yNzgtNC4zODgtMi4yNDUtMy43NTQtNC44MjcgMS4yNjUtMS41MDYgNC40NDUtMS4wODcgNi40MzUtMS4zNCA0LjIxLjg3MiA0LjA0LTQuNzcgMS44NzctNi43MDQtMS40NzktMi43MjctNS4xNC0zLjktNi4xNjctNi43MDMuNDEtMy43MTctMi4wNTgtNy40MzItNS4wOTQtOS4yNS00LjY3LS4zMjgtOC4xOTYgMy43MDItOS45MjEgNy42NDEtMS45NDIuNTYxLTMuODc4IDEuMTQ0LTUuNzY1IDEuODc3LTMuMDQyLjc2MS03LjM3OCA2LjAzNi0zLjIxOCA4LjA0NCAyLjMzNS42NDMgOS40NCAyLjI2NCA2LjMwMSA1LjQ5Ni0xLjc2OCAzLjAzNC01LjE1MiAzLjA4Ni04LjE3OCAyLjI4LTMuMTA0LjAwMi02LjU2LTEuNTEtNi40MzUtNS4wOTUtLjYzMy0zLjIxNy0uNTI5LTYuNjg0LTIuMDEtOS42NTMtLjYzOC0zLjYtNC43MjMtMi43NTgtNC45NjEuNTM2LTMuMTQ2IDIuMjkyLTIuNzI3IDUuOTk3LS41MzYgOC43MTUgMS4zNjcgMy4xMjcuMDEzIDYuNzY4LTEuMzQgOS42NTItLjgyIDMuNzU0LTQuOTYgMy44ODItNy45MTEgNS4wOTUtMS40NDguNTYyLTYuOTg2LS4zMzQtNC45NiAyLjgxNSAzLjIzIDEuMTQgNy4wOSAyLjE2NiAxMC40NTcgMS4zNCAzLjUzLS40MzcgNi41OTYtMi44NTEgOC4zMTItNS44OTggMi4zNzEtMi40MDMgNi40NDQtMS4xNDUgOS41MTktMS4yMDcgMy4zMTUtLjAwOCA2LjcwNCAyLjMyOCA5LjkyLjgwNS45MzMtMi40MjEgNS4yNDMtNi40MTcgNi41Ny0yLjI4LS4yMjYgMy43MDIgMy4wNDMgNS42ODggNi40MzUgNS4yMyAzLjcwNi0uMjEyIDIuMzM2IDIuNjIgMi4yOCA0LjgyNi4yNDQgNC4wMDkgMi44MyA2LjExMiA2LjE2NiA3Ljc3NiAxLjEzNy4zMDYgMi4zMzguMjAzIDMuNDg2IDAgMy4yMDktMS4wMDkgNi42NjUtMi40NCA3LjY0Mi02LjAzMyAxLjMwMi0yLjkyIDEuMzMzLTYuMjI0IDIuMjc5LTkuMjUuNzYtNC44NDggMS43NDEtOS42OTYgMS44NzctMTQuNjEzIDEuMTg0LTQuNDU1Ljg0NC05LjE2NCAxLjc0Mi0xMy42NzUuNTY4LTMuMzU0Ljk5LTYuNzA3IDEuMzQxLTEwLjA1NS0uMzkzLTEuNzktMS4xNjYtMi4wOS0yLjE0NS0xLjc0M3ptLTI5LjA5MiAxNy44M2MuNjUuMDggMS4wMS44NzYgMS4wNzMgMi4yOC4wNjggMS41NjEuODg1IDIuODM0IDEuODc3IDMuMDgzLjc4Mi4xOTYuNzE1IDEuMDI1LS4xMzQgMS42MDktLjQ5NC4zNC0xLjM3Ny41NDUtMi45NS41MzYtMi40OC0uMDEzLTQuMDE3LS42NTUtNS4zNjItMi4wMTFsLS44MDUtLjgwNCAxLjIwNy0uODA1YTI3LjU4IDI3LjU4IDAgMCAwIDIuNDEzLTIuMTQ1YzEuMjIyLTEuMjQ3IDIuMDMyLTEuODIyIDIuNjgxLTEuNzQzem0yODMuMjgyLTMzLjc5YTM1Ljg3OCAzNS44NzggMCAwIDAtNy4xMDUgMS4wNzNjLTQuNDYzLS4yNzgtNi43MDMgNC40MDYtMi40MTMgNi43MDMgMi41OCA2LjU4MyA2LjYwOC0xLjM1OSAxMC43MjUtLjgwNCA2LjE2NyAxLjIgNi42ODggNy44NiA3LjY0MiAxMi44Ny4zNDcgNC45NjMgMS43NzcgOS43ODkgMy4yMTcgMTQuNDggNC4xMjggNC41ODgtMy4wOTIgNy40NjUtNi4xNjcgMy44ODctMi42MjItMi44NS04LjIzOS02LjM0Ny0xMS4zOTUtMi40MTMtMy44NzcgMS42NDItNC4wMzYgNi44MjMtNy4yNCA4LjMxMi01LjE4NyAxLjU4LTUuODQtNC44LTguNTgtNy41MDctMi41Mi0zLjUzNy03LjMzOC0zLjg0Ni0xMS4yNjItNS4wOTUtMS44NC0zLjcyNy0uODgxLTEwLjA2My00LjY5Mi0xMi42MDItMy4yIDEuMzA1LTkuMDY2IDcuMzAyLTQuMTU2IDEwLjA1NSA0Ljc5NSA0LjEyMS0yLjA5MyA2LjAxLTQuMjkgOC44NDgtMy4xMzkgMy40OTUtMy42NCA4LjMwNi00LjE1NyAxMi43MzctNS40MDIgMi45ODQtNi40NTQtMy4zOC03LjEwNS03LjM3NC0uNDItNC43NjgtNC40NDQtMy4zNjktNy4yNC0xLjYwOS00LjA4NiAxLjY1Ni02LjEyNiA1LjUzNi04Ljk4MiA4LjU4LS4zNDMgMi43NzkuMTYgNS44Mi4xMzQgOC43MTUuOTI4IDMuNDggNS4xNTggMS44NDYgNy43NzYgMS42MDggNC4xOTktMS43NTYgNS45MTggMi42OTIgMi41NDcgNS4yMy0yLjI4MiAyLjktOS41MjMgMS4zODUtOC44NDggNi4wMzIgMi4zMzMuMjczIDQuNzY0LjE4NSA3LjEwNSAwIDQuNjc4LTEuMjc4IDkuNzAxLTQuNTc5IDEwLjE4OS05Ljc4Ny42MTYtNC41NCA3LjE1NC0zLjcxMyAxMC43MjUtNC42OTIgNC40NjUtMS4yODcgOS44NDUtMS42MTggMTAuODYgNC4wMjIgMy4wNDMgMy4xOTYgOS42NDYgNi43OTUgMTMuMDA0IDIuNDEzIDMuNDA4LTIuMDgyIDUuMDQ2LTUuNzM5IDQuODI2LTkuNjUzLS42OTUtMy4zNjYgNS40NDMtMy40ODggNi45NzEtMS42MDkgMi4yMzcgMy42ODEgOS4yMjggMi41OTUgMTIuNjAzLjUzNyAzLjU4Ny0yLjY0OCA0LjM2NS03LjMxNSA5LjUxOS03LjM3NCA3LjY0Ni0yLjI5IDE1LjU5LTMuNjEgMjMuMDU5LTYuNDM1IDYuMDUtMS4zMTktLjktNS4xMzktMi40MTMtNy4zNzQtNC42MDctMi4yNzgtOC42MTUgNy4wNDQtMTMuODEgMi40MTMtNC4wMTMtMy4wNzItMy43NC04LjkwOS01LjIyOC0xMy40MDctMS4wMTctNS44MjMtLjc2LTEyLjUzOC00Ljk2LTE3LjE2LTIuODg1LTMuMDY3LTYuODA0LTMuODA2LTEwLjg2LTMuNjJ6bS0yOS4yMjYgNDAuNjIzYy41NC0uMDEzIDEuMTQ4LjI1NCAyLjE0NS44MDQgMS44OCAxLjAzOCAzLjIyIDIuNzU4IDMuMjE3IDQuMTU2LS4wMDEuOTEyLS4yMzMuOTc0LTEuNjA4IDEuNjA5LS44NDYuMzktMS44MDguODA5LTIuMTQ2LjgwNC0uNzc2LS4wMDgtMi42NzgtMS41My0yLjY4LTIuMTQ1LS4wMDQtLjI1NS0uMjUtMS4yMjktLjUzNy0yLjAxLS41MDUtMS4zNzYtLjQyNy0xLjM1OC4yNjgtMi4yOC40NDQtLjU5LjgwMS0uOTI0IDEuMzQtLjkzOHptMjguMDIgMS40NzRjMS41OTctLjEwNCAyLjU0Ni4zOTQgMy4yMTcgMS42MS43OCAxLjQxLjI1IDIuNDkyLTEuNzQzIDMuMzUtLjg3My4zNzgtMS43NDYuNjg0LTEuODc3LjY3MXMtLjg1MS0uNDQtMS42MDktLjkzOGMtMS4xNTgtLjc2My0xLjMyNy0xLjEzMi0xLjM0LTIuMDExLS4wMTMtMS4zNTMgMS40OTgtMi41NiAzLjM1MS0yLjY4MnptLTM4LjM0NC40MDJjLjQ2OC0uMDcyLjg5NC4xNzIgMS40NzUuNjcuNzcyLjY2NCAxLjAxNiAxLjE5NyAxLjIwNyAyLjU0OC4xMzQuOTM5LjExMyAyLjE1MyAwIDIuNjgxLS4yMDkuOTctLjIyOS45MjYtMi40MTMuOTM5LTIuNzQ3LjAyNi0zLjAwMi0uMjc0LTIuOTUtMi44MTYuMDM0LTEuNjE2LjA1LTIuMDUxLjkzOS0yLjk0OS42ODgtLjY5NiAxLjI3NS0xIDEuNzQyLTEuMDczem0tMjMuNTk1IDYuMTY4Yy44NTYuMiAxLjY2NC44NDcgMS44NzcgMS44NzYuMjgxIDEuMzYzLjAzNCAxLjk4My0xLjA3MyAyLjU0OC0uOTUzLjQ4NS0zLjE0OS42NDctMy43NTQuMjY4LS4xOTYtLjEyMy0uNi0uNDQyLS44MDQtLjgwNS0uMjkyLS41Mi0uMjM4LS43Ny4xMzQtMS4wNzIuMjYtLjIxMS41MzgtLjUxNC41MzYtLjY3cy4yODktLjcuNjctMS4yMDdjLjYyNy0uODMyIDEuNTU4LTEuMTQgMi40MTMtLjkzOHptMzkuNjgzIDUuMDk0Yy43NjQtLjAwNCAxLjQxLjI2MSAxLjg3Ny42Ny43OTUuNjk3Ljc2OCAxLjcxOC0uMTM0IDIuNDE0LS41OC40NDctMy43NC40MDYtNC44MjYgMC0uNDg0LS4xODEtLjY2OC0uNDI0LS42Ny0uOTM5LS4wMDktLjYwNC4xNi0uOTc3IDEuMjA2LTEuNDc1Ljg3Ny0uNDE4IDEuNzg0LS42NjUgMi41NDgtLjY3em0tNzMuNjY2IDIwLjY3M2MtLjQxMS0uMjY4LTEuMDItLjUwMi0uNDA3LS45NS43NDEtMS4yOTggMi4yMjItMS43NDcgMy41MzctMi4yMyAyLjM1LTEuMDE4IDQuMzc5LTIuNzQ3IDUuODkzLTQuNzk4LjIxNC0xLjQyOSAxLjgxOC0yLjIwNCAxLjgxMS0zLjY5Ny4wMTMtMi4wMzguMTM0LTQuMTI2LS4zNjMtNi4xMTgtLjU1LTEuODI2LTEuOTM3LTMuMjI2LTMuNTQ2LTQuMTc4LTEuMS0uODY1LTIuODkxLTEuMTAzLTMuMjk4LTIuNjM1LS4yMjUtMS40NyAxLjA4OC0yLjU5IDEuNTQ3LTMuOS45NTgtMS44MSAxLjc2NC0zLjcwNiAyLjc5My01LjQ3IDEuMTExLTEuMjM1IDIuODI2LS4wNjggMy40MDEgMS4xMjUuODEyIDEuMTkxIDEuNTMxIDIuNDcgMS45MzQgMy44NSAxLjI5NyAxLjQyNCAyLjQ0NyAzLjA5MyAyLjkxMyA0Ljk4NS42MzcgMS4zMzIgMS42NDQgMi41ODQgMS41ODUgNC4xNDQgMCAxLjc4NyAxLjAwOCAzLjM3OC45NDUgNS4xNzUuMDU3IDIuNDA1LjA1NiA0LjkxMi0uODIzIDcuMTgyLS42IDEuMjYtMS44MDQgMi4wMTUtMi42MDIgMy4xNDMtMS4zNjggMS4yNjgtMi44NzYgMi40ODQtNC42MzIgMy4xNTgtMS4yNC4zOTUtMS45NiAxLjgyNi0zLjUxNSAxLjQ3OS0yLjIwNy4wMzktNC40NDcuMzM5LTYuNjM3LS4wMTcuMTM4LjIzMi0uNjcxLS4zOTMtLjUzNi0uMjQ2em0tMjkuMzg3IDEuOTMxYy0xLjA0Mi0xLjA3MS0xLjI2Ny0xLjUyNS0xLjI3OS0yLjU3Ni0uMDEyLTEuMDYyLjE5Mi0xLjQ4MyAxLjIxMS0yLjUxMyAxLjg4LTEuODk5IDIuOC0xLjk0NSA2LjA0NS0uMzAyIDMuMTAyIDEuNTcgNC4xNTEgMS43MTIgNC40MjkuNi4yNjgtMS4wNzMgMi4wNTQtMi4wNTUgMy43NS0yLjA2MiAxLjA3My0uMDA5IDEuNjguMjA1IDIuNTQuODc0IDEuMDc4Ljg0IDEuMTMuOTcgMS4xNTggMi45MTQuMDE3IDEuOTg3LS4wMDkgMi4wNjItMS4yNDYgMy4xNTgtMS4xOSAxLjA0Ny0xLjM4MSAxLjExMS0yLjg1NS45NjQtMS44NzYtLjE4OS0zLjAwMS0xLjA0Ny0zLjMwNy0yLjUyNS0uMjIxLTEuMDcyLS41OTgtMS4zMjgtLjg4LS42LS4wOS4yMzUtLjU1Mi41MjQtMS4wMjUuNjQzLS44NzMuMjItMi4zNTUgMS4xNTItMy40MDcgMi4xNDUtLjM5OC4zNzUtMS4wOTUuNTUyLTIuMjI1LjU2My0xLjUyNi4wMTMtMS43MzgtLjA3OC0yLjkxLTEuMjgzem0tODUuMDMtMzguMTgyYy0yLjg1Mi4wMy01LjkyMyAyLjQyOS02LjMwMiA1LjIyOC42NTIgMy4yMjggMy4zMzMgNi4zOSAxLjYwOSA5Ljc4NyAxLjE5IDQuMzQ2LTMuMjY3IDUuOTk1LTYuMzAyIDMuNDg2LTEuODMyLTQuMTY3LTIuNzYtOC43MzQtNS40OTYtMTIuNDY4LTMuNDUtLjk3Ny00Ljk1MyA0LjUzNC03LjM3NCA2LjQzNSAxLjIgMy4yNCA0LjcwMSA2LjE0NSA1LjA5NCAxMC4xODkuODM4IDMuOTI1LTEuNTUgOC4yODItNC45NiAxMC4zMjMtMi45NDIgMi44MDktNi45NzMgMS44MDUtMTAuNTkxIDIuNDEzLTQuMzk0IDIuNTY4IDMuMjI1IDMuNTA3IDUuMjI5IDMuNjIgNC40OTQuNDU3IDkuMTYtLjEzNiAxMi40NjctMy40ODYgMy4zLTEuNTc1IDMuMDQ1LTcuMjgxIDYuOTcyLTcuOTEgNi44MTQtLjMwNCAxMy41NjggMS4wNDUgMjAuMzc4IDEuMjA3IDMuNjQ0Ljg3MiA5LjI4Mi0uNDM0IDExLjc5OCAyLjI3OS4wMDggNC43NTEgNC4wMzYgNy42ODEgNy45MSA5LjUxOSAyLjE0LjU5NSA0LjM5NC0yLjA1NyA2LjU2OS0yLjU0OCA0LjE0MS0xLjMyIDIuODgyLTYuNDQzIDUuMzYzLTguNDQ2IDcuMDgtLjM4MyAxNC4yMjctLjMwMiAyMS4zMTYtLjQwMiAxLjM1LjAzNCAxLjc0OC0xLjg4NyAyLjY4Mi0yLjY4MS0uMTU2LTIuNzQtLjI1NS01LjQ2LS42Ny04LjE3OC0xLjM2Ni0zLjQ2LjIyLTcuOTE0LTIuMjgtMTAuODYtMy41Ni0uOTctNi41OSAyLjI5LTEwLjE4OSAyLjU0OC0zLjk3MyAxLjc3LTcuMzIgNS40MzktNy41MDcgOS45Mi0yLjM1MyAzLjg0Ny02LjEyNS0uNjg0LTQuODI3LTMuODg3LS4xNDgtMS4zOTYuMzAyLTMuMDIyLS4xMzQtNC4yOS0yLjE3NS0yLjYxLTUuOTgzLTEuNzU3LTguOTgyLTIuMTQ1LTQuMzcuMTc0LTguNjM1LS43Ny0xMy4wMDUtLjY3LTMuODMtLjI5LTcuODE2LjMzMy0xMS41My0uNjctNC40MjUtLjEyNy0zLjgxNi00LjQ1NS00LjU1OC03LjUwOS0uNzg1LS41ODItMS43My0uODE0LTIuNjgtLjgwNHptOC41OCAxNS44MmMxLjQ3MS4wMyAyLjg1OS4yMjIgNC4yOS40MDEgMS44NDguMzA1IDMuODE3LS42MzUgNS42MyAwIDQuMTkuNzEzIDguMzgxLjU0NSAxMi42MDMuOTM5IDEuMTE0LS4wMTcgMS45MTIuNzkyIDIuNjggMS40NzV2OC44NDhjLS4xMjcgMS4xMDUuMzI4IDIuNTY2LS42NyAzLjM1Mi0uMzIuMjItLjY3OS40Ni0xLjA3Mi41MzYtMS4xNjEtLjMtMi4zOS0xLjA2NC0yLjk1LTIuMTQ1LS4xNzctMS41MzQuMDc3LTMuMDIuMTM0LTQuNTU4LS4wMy0uMzk4LjE3NC0xLjAxNyAwLTEuMzQxLS45MTItLjY0Ny0xLjk0Ny0xLjA2OC0zLjA4My0xLjA3My0zLjY0NC0uMTI1LTcuMjE2LS4zOTMtMTAuODYtLjUzNi0zLjAzMi0uMTkxLTYuMTQ4LjI2LTkuMTE2LS41MzYtMS4xNTEtLjQxOS0yLjY1LS4yNzUtMy4zNTEtMS40NzUtMS4wMDUtMS4xNjguNDQ0LTIuNTYgMS40NzQtMy4wODMgMS4zNjYtLjYyMSAyLjgxOS0uODMzIDQuMjktLjgwNXptNDguMzk2IDEuMDcyYy42ODEtLjAwOS44OTguMjE0IDEuMjA3IDEuNDc1bC41MzYgMi4xNDVjLjE1Ni41MDYtLjA5My42Ny0uODA0LjkzOC0yLjEyLjgtNC4yMjkuNzItNC45Ni0uMjY4LS4zMzMtLjQ0OC4wNTUtMS44NjQuNjctMi40MTMgMS4yNDItMS4xMSAyLjYxNi0xLjg3NSAzLjM1MS0xLjg3N3oiIGNsYXNzPSJCIEMiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMTQ3Ni40MjggLTQxNy45ODkpIHNjYWxlKDQuMjkwMTIpIj48cGF0aCBkPSJNNDYyLjMxIDI1My4wOWMuNjY3LjA0LS45MDItMy41NjgtLjkwMi0zLjU2OCAxLjc2NSAxLjgwNCA4LjQzIDIuMjM1IDguNDMgMi4yMzUtNC0xLjc2Ni03Ljk5OC0xNS4wOTYtNy41MjgtMjUuNzIxLjQzMi0xMC42NjQtMS41MjgtMTQuODYtMy4wOTctMTYuNDI4LTItMi04LjQzLTMuNzY0LTEyLjY2NC00LTIuMzkyLS4xMTctMiAxLjgwNC0yIDEuODA0LTQuNDMtMS4xMzctOC44Ni0xLjU2OC0xMC44Ni0uMjM1LTEuODgzIDEuMjU1LTIuMjc1IDcuNTI4LS45MDIgNi40MyAzLjMzMi0yLjY2NiA2LjIzNC0uMjM1IDguMjMzIDIuNjY2IDEuNzY0IDIuNTQ5IDEuNjQ3IDkuNzYzLS45MDIgMTguMTkyLTIuNjY2IDguODYxLTkuOTU5IDE3LjcyMi05Ljk1OSAxNy43MjIgMy45NiAwIDkuNTI4LTMuNTI4IDkuNTI4LTMuNTI4bC0xLjMzMyA1LjUyOGM0LjE5NS0yIDcuNTI4LTUuMDk3IDcuNTI4LTUuMDk3bDMuOTk5IDQuMTk1YzEuMzMzLTEuNzY0IDQtNC4xOTUgNC00LjE5NXMzLjMzMiAzLjUyOSA4LjQyOSA0eiIgc3Ryb2tlLXdpZHRoPSIxLjIxOCIvPjxwYXRoIGQ9Ik00NDYuMTIgMjI3LjU3cy0yLjIzNSAxNi40MjgtNi40MyAyMS4wOTRtOS45Ni0yMS41MjRzLS44NjMgMTYuNjIzLTMuNzY0IDIxLjk1Nm02Ljg5NC0yMS4yODZzMCAxOC4xOTIgMS4wOTggMjEuMjg5bTIuODYyLTIwLjM4OXMuOTAyIDE1LjI5MSA0LjY2NiAyMC44MTkiIGZpbGw9Im5vbmUiIHN0cm9rZS13aWR0aD0iMS4yNyIvPjxwYXRoIGQ9Ik00NDIuMDggMjE5LjYxYy0uMTk2LTEuNDUtLjU0OS0yLjU4OC0xLjA1OS0zLjMzMy0yLTIuOTAxLTQuOS01LjMzMi04LjIzMy0yLjY2NiAwIDAgMS4xMzctMy41MjkgMy41NjgtMy42NDYgMS44ODItLjExOCA2LjE1NSAxLjQxMSA5LjkyIDcuODQxIDAgMC0yLjc4NC0uNjI3LTMuNDUtLjAzOS0xLjI1NiAxLjA5OC0uNzQ2IDEuODQzLS43NDYgMS44NDN6bS05LjY0LTEwLjM1Yy4yNzQtLjkwMi43MDYtMS43MjUgMS4yNTUtMi4wNzggMi0xLjMzMyA2LjQzLS45MDIgMTAuODYuMjM1IDAgMC0uMzkyLTEuOTIxIDItMS44MDMgNC4yMzQuMjM1IDEwLjY2NCAyIDEyLjY2MyAzLjk5OS40Ny41MSAxLjAyIDEuMjU1IDEuNDkgMi4zOTFoLS4wNzhjLS45OC0xLjM3Mi0zLjc2NC0xLjI5My00LjQzMS0xLjIxNS0xLjA1OS4xMTgtMS43MjUuMDc4LTMuMTM3LjQzMS0uNjY2LjE1Ny0xLjY4Ni4zNTMtMi4yMzUuNzg0LS40My4zNTMtLjc4NCAxLjY0Ny0xLjQ1IDEuNjQ3LTEuMDU5IDAtLjk4LS4yNzQtMS4yNTUtLjU4OC0uMzUzLS40MzEtLjU0OS0xLjA1OS0uOTAyLTEuMDItMS4wOTcuMTk3LTIuODYyLS42NjYtNS4wOTYtMi40M3MtMy4wOTgtMi4xOTYtNS45OTktMmMtMi44NjIuMjM1LTMuNzY0IDEuODQzLTMuNzY0IDEuODQzeiIgc3Ryb2tlLXdpZHRoPSIuMzU0IiBjbGFzcz0iQiIvPjxjaXJjbGUgcj0iMS4xNzYiIGN5PSIyMTAuNjcyIiBjeD0iNDQ4LjgyNCIgY2xhc3M9IkMiLz48L2c+PHBhdGggZD0iTTQ1NC4wNDIgOTg1Ljg2OEM1OTQuMDgxIDg3OC4xNiA1ODIuMDczIDcyMC4zODEgNTgyLjA3MyA3MjAuMzgxYy0zLjY5NS43MzktNy4yMDUgMS4xMDgtMTAuOSAxLjEwOC0yOS4zNzUgMC05OS40MzctMTYuODA1LTExNS43ODItMzguMTUxLTE3LjUwOSAxOS4zMi04OS4xMDYgMzguMTUxLTExOC4yOTYgMzguMTUxLTMuNjk1IDAtNy4zOS0uMzY5LTEwLjktMS4xMDggMCAwLTEyLjE5MyAxNTcuNzc0IDEyNy44NDYgMjY1LjQ4N3oiIHN0cm9rZS13aWR0aD0iNC45MzQiLz48cGF0aCBkPSJtNTcwLjkwNSA3MzEuOTM0LTMuNjM3LjExM2MtMjYuNjIyIDAtODguNDU4LTEzLjY1OS0xMTIuMjk0LTM0LjEzOC0yNC45NjYgMTguOTE3LTg3LjgyMyAzNC4xMzgtMTE0LjAxNSAzNC4xMzgtMS4yMjggMC0yLjQ0Mi0uMTUtMy42NDUtLjM3MS0uMDYxIDUuOTY3LjI0OSAxMi4xNTEuNjIgMTcuNzc3IDEuMzg2IDIxLjAyNSA1LjA3NCA0Mi4xMjUgMTAuNjcyIDYyLjQzIDE3LjYyNCA2My45MDIgNTMuNjk1IDExOC4yMDYgMTA1LjQxNyAxNTkuNCA1MS43NjUtNDEuMjI4IDg3Ljg3OS05NS41ODQgMTA1LjU0Mi0xNTkuNTMzIDUuNjA4LTIwLjMwMSA5LjMwNy00MS4zOTkgMTAuNzA2LTYyLjQyMi4zMjctNS44ODYuNjU1LTEzLjA5My42MzQtMTcuMzk0eiIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjkzIi8+PGcgY2xpcC1wYXRoPSJ1cmwoI0EpIiB0cmFuc2Zvcm09Im1hdHJpeCgxNi4wNDIwNyAwIDAgMTYuMDQyMDcgMjMyNS40NjQgLTIxNzkuMjg1KSIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGFzcz0iQyI+PHVzZSB4bGluazpocmVmPSIjQiIgY2xhc3M9IkIiLz48cGF0aCBkPSJNLTExOS4wOTMgMTc5LjI2aDQuODgzdjE3LjE5OGgtNC44ODN6Ii8+PHBhdGggZD0iTS0xMTQuMjEgMTc5LjI2aDQuODgzdjE3LjE5OGgtNC44ODN6IiBjbGFzcz0iQiIvPjwvZz48L2c+PC9zdmc+", "jo": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDEwMDgwIDUwNDAiPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0wIDBoMTAwODB2NTA0MEgweiIvPjxwYXRoIGQ9Ik0wIDBoMTAwODB2MTY4MEgweiIvPjxwYXRoIGZpbGw9IiMwMDdhM2QiIGQ9Ik0wIDMzNjBoMTAwODB2MTY4MEgweiIvPjxwYXRoIGZpbGw9IiNjZTExMjYiIGQ9Ik01MDQwIDI1MjAgMCA1MDQwVjBtMTU1NyAyMTYwLTc4IDE5OC0yMDMtNjIgMTA2IDE4NC0xNzYgMTIwIDIxMSAzMi0xNiAyMTIgMTU2LTE0NCAxNTcgMTQ0LTE2LTIxMiAyMTAtMzItMTc1LTEyMCAxMDYtMTg0LTIwMyA2MnoiLz48L3N2Zz4=", "ca": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDk2MDAgNDgwMCI+PHBhdGggZmlsbD0icmVkIiBkPSJNMCAwaDI0MDBsOTkgOTloNDYwMmw5OS05OWgyNDAwdjQ4MDBINzIwMGwtOTktOTlIMjQ5OWwtOTkgOTlIMHoiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMjQwMCAwaDQ4MDB2NDgwMEgyNDAwem0yNDkwIDQ0MzAtNDUtODYzYTk1IDk1IDAgMCAxIDExMS05OGw4NTkgMTUxLTExNi0zMjBhNjUgNjUgMCAwIDEgMjAtNzNsOTQxLTc2Mi0yMTItOTlhNjUgNjUgMCAwIDEtMzQtNzlsMTg2LTU3Mi01NDIgMTE1YTY1IDY1IDAgMCAxLTczLTM4bC0xMDUtMjQ3LTQyMyA0NTRhNjUgNjUgMCAwIDEtMTExLTU3bDIwNC0xMDUyLTMyNyAxODlhNjUgNjUgMCAwIDEtOTEtMjdsLTMzMi02NTItMzMyIDY1MmE2NSA2NSAwIDAgMS05MSAyN2wtMzI3LTE4OSAyMDQgMTA1MmE2NSA2NSAwIDAgMS0xMTEgNTdsLTQyMy00NTQtMTA1IDI0N2E2NSA2NSAwIDAgMS03MyAzOGwtNTQyLTExNSAxODYgNTcyYTY1IDY1IDAgMCAxLTM0IDc5bC0yMTIgOTkgOTQxIDc2MmE2NSA2NSAwIDAgMSAyMCA3M2wtMTE2IDMyMCA4NTktMTUxYTk1IDk1IDAgMCAxIDExMSA5OGwtNDUgODYzeiIvPjwvc3ZnPg==", "us": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTIzNSIgaGVpZ2h0PSI2NTAiIHZpZXdCb3g9IjAgMCA3NDEwIDM5MDAiPjxwYXRoIGZpbGw9IiNiMzE5NDIiIGQ9Ik0wIDBoNzQxMHYzOTAwSDAiLz48cGF0aCBzdHJva2U9IiNGRkYiIHN0cm9rZS13aWR0aD0iMzAwIiBkPSJNMCA0NTBoNzQxMG0wIDYwMEgwbTAgNjAwaDc0MTBtMCA2MDBIMG0wIDYwMGg3NDEwbTAgNjAwSDAiLz48cGF0aCBmaWxsPSIjMGEzMTYxIiBkPSJNMCAwaDI5NjR2MjEwMEgwIi8+PGcgZmlsbD0iI0ZGRiI+PGcgaWQ9ImQiPjxnIGlkPSJjIj48ZyBpZD0iZSI+PGcgaWQ9ImIiPjxwYXRoIGlkPSJhIiBkPSJtMjQ3IDkwIDcwLjUzNCAyMTcuMDgyLTE4NC42Ni0xMzQuMTY0aDIyOC4yNTNMMTc2LjQ2NiAzMDcuMDgyeiIvPjx1c2UgeGxpbms6aHJlZj0iI2EiIHk9IjQyMCIvPjx1c2UgeGxpbms6aHJlZj0iI2EiIHk9Ijg0MCIvPjx1c2UgeGxpbms6aHJlZj0iI2EiIHk9IjEyNjAiLz48L2c+PHVzZSB4bGluazpocmVmPSIjYSIgeT0iMTY4MCIvPjwvZz48dXNlIHhsaW5rOmhyZWY9IiNiIiB4PSIyNDciIHk9IjIxMCIvPjwvZz48dXNlIHhsaW5rOmhyZWY9IiNjIiB4PSI0OTQiLz48L2c+PHVzZSB4bGluazpocmVmPSIjZCIgeD0iOTg4Ii8+PHVzZSB4bGluazpocmVmPSIjYyIgeD0iMTk3NiIvPjx1c2UgeGxpbms6aHJlZj0iI2UiIHg9IjI0NzAiLz48L2c+PC9zdmc+"};
        const COUNTRY_FLAGS = {
            'Syria': 'sy', 'Lebanon': 'lb', 'Lebanon OMT': 'lb',
            'Gazah': 'ps', 'Gaza': 'ps', 'Dafeh': 'ps',
            'Turkey': 'tr', 'Iraq': 'iq', 'Egypt': 'eg', 'Jordan': 'jo'
        };
        function countryFlag(country) { return COUNTRY_FLAGS[country] || null; }
        function flagImage(code, alt = '') {
            return code && FLAG_DATA[code] ? `<img class="flag-img" src="${FLAG_DATA[code]}" alt="${alt}">` : '';
        }
        function syncCountrySelectUI() {
            const select = document.getElementById('country-input');
            const trigger = document.getElementById('country-select-button');
            const flag = document.getElementById('destination-flag');
            if (!select || !trigger || !flag) return;
            const country = select.value;
            trigger.innerText = country || 'Select a country…';
            flag.innerHTML = country
                ? flagImage(countryFlag(country), `${country} flag`)
                : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/></svg>';
            document.querySelectorAll('#country-options .country-option').forEach(option => {
                option.classList.toggle('selected', option.dataset.country === country);
            });
        }
        function toggleCountryMenu() {
            const menu = document.getElementById('country-options');
            if (menu) menu.classList.toggle('open');
        }
        function chooseCountry(country) {
            const select = document.getElementById('country-input');
            select.value = country;
            document.getElementById('country-options').classList.remove('open');
            syncCountrySelectUI();
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function updateSettingsCountryFlag() {
            const select = document.getElementById('settings-country');
            if (!select) return;
            const code = countryFlag(select.value);
            select.style.backgroundImage = code ? `url("${FLAG_DATA[code]}")` : 'none';
        }

        document.addEventListener('click', event => {
            if (!event.target.closest('.country-select-shell')) {
                const menu = document.getElementById('country-options');
                if (menu) menu.classList.remove('open');
            }
            if (!event.target.closest('.currency-chip-picker')) closeCurrencyChipMenus();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                const menu = document.getElementById('country-options');
                if (menu) menu.classList.remove('open');
                closeCurrencyChipMenus();
            }
        });

        // Initial setup
        populateCountrySelects();
        setMode(1);

        // --- Google Finance live rate ---
        // Google Finance does not offer a supported browser API. We read its public
        // CAD/USD quote (through a CORS text proxy when necessary) and invert it to USD/CAD.
        // The settings card shows this unmodified spot rate. The calculator uses spot + CAD 0.0300.
        function parseGoogleCadUsd(payload) {
            let text = payload;
            if (/<[a-z][\s\S]*>/i.test(payload)) {
                try { text = new DOMParser().parseFromString(payload, 'text/html').body.innerText; } catch (e) {}
            }
            text = String(text).replace(/\u00a0/g, ' ').replace(/,/g, '');
            const markers = [
                'Canadian Dollar / United States Dollar',
                'CAD / USD'
            ];
            for (const marker of markers) {
                const index = text.indexOf(marker);
                if (index !== -1) {
                    const nearby = text.slice(index + marker.length, index + marker.length + 500);
                    const match = nearby.match(/(?:^|\s)(0\.\d{3,8})(?:\s|$)/);
                    if (match) {
                        const cadUsd = Number(match[1]);
                        if (cadUsd > 0.5 && cadUsd < 1.5) return 1 / cadUsd;
                    }
                }
            }
            // Classic Google Finance markup fallback.
            const classMatch = payload.match(/class="[^"]*(?:YMlKec|fxKbKc)[^"]*"[^>]*>\s*([0-9.]+)/i);
            if (classMatch) {
                const cadUsd = Number(classMatch[1]);
                if (cadUsd > 0.5 && cadUsd < 1.5) return 1 / cadUsd;
            }
            throw new Error('Could not locate the CAD/USD quote in Google Finance');
        }

        function fetchTextWithTimeout(url, timeoutMs = 9000) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            return fetch(url, { cache: 'no-store', signal: controller.signal })
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.text();
                })
                .finally(() => clearTimeout(timer));
        }

        async function getUsdCadRate() {
            let lastError;
            for (let attempt = 0; attempt < 2; attempt++) {
                const stamp = Date.now();
                const target = `https://www.google.com/finance/quote/CAD-USD?hl=en&gl=CA&_=${stamp}`;
                const sources = [
                    `https://r.jina.ai/http://www.google.com/finance/quote/CAD-USD?hl=en&gl=CA&_=${stamp}`,
                    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
                    `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
                    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
                    target
                ];

                try {
                    const rate = await Promise.any(sources.map(async url => {
                        const payload = await fetchTextWithTimeout(url);
                        const parsedRate = parseGoogleCadUsd(payload);
                        if (!Number.isFinite(parsedRate) || parsedRate < 1 || parsedRate > 2) {
                            throw new Error('Google quote is outside the expected range');
                        }
                        return parsedRate;
                    }));
                    return {
                        rate,
                        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        source: 'Google Finance · CAD/USD inverted'
                    };
                } catch (error) {
                    lastError = error;
                    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 1200));
                }
            }
            throw lastError || new Error('Google Finance readers did not respond');
        }

        function readCachedGoogleRate() {
            try {
                const cached = JSON.parse(localStorage.getItem('last_google_usdcad') || 'null');
                if (!cached) return null;
                const spotRate = Number(cached.spotRate);
                const calculationRate = Number(cached.calculationRate || (spotRate + 0.03));
                if (!Number.isFinite(spotRate) || spotRate < 1 || spotRate > 2) return null;
                return { spotRate, calculationRate, fetchedAt: Number(cached.fetchedAt) || Date.now() };
            } catch (error) {
                return null;
            }
        }

        function renderGoogleRate(googleSpotRate, options = {}) {
            const { forceApply = false, cached = false, updatedAt = Date.now() } = options;
            const calculationRate = googleSpotRate + 0.03;
            const formattedSpot = googleSpotRate.toFixed(4);
            const formattedCalculation = calculationRate.toFixed(4);
            const time = new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const status = document.getElementById('rate-status');
            const note = document.getElementById('spot-rate-note');
            const spotValue = document.getElementById('spot-rate-value');
            const rateInput = document.getElementById('rate-input');

            if (spotValue) {
                spotValue.innerText = formattedSpot;
                spotValue.style.color = 'var(--brass-deep)';
            }
            if (note) {
                note.innerText = cached
                    ? `Last successful Google Finance rate · saved ${time} · refreshing in background`
                    : `Google Finance · fetched ${time} · indication only`;
            }
            document.getElementById('sidebar-rate').innerText = `1 USD = ${formattedCalculation} CAD`;
            if (status) {
                status.classList.add('is-live');
                status.innerText = cached
                    ? `● Current saved rate · spot + 0.0300 · live refresh pending`
                    : `● Live calculation rate · spot + 0.0300 · refreshed ${time}`;
            }

            // Automatic updates continue unless the operator manually edited the rate.
            // Pressing Refresh explicitly returns the field to live-update mode.
            if (forceApply) rateInput.dataset.manuallyEdited = 'false';
            if (forceApply || rateInput.dataset.manuallyEdited !== 'true') {
                rateInput.value = formattedCalculation;
                calculate();
            }
            return calculationRate;
        }

        let googleRateRetryTimer = null;
        async function refreshGoogleRate(forceApply = false, silent = false) {
            const status = document.getElementById('rate-status');
            const refreshBtn = document.getElementById('rate-refresh-btn');
            const note = document.getElementById('spot-rate-note');
            const cached = readCachedGoogleRate();

            if (!silent && status) status.innerText = cached ? 'Refreshing Google Finance… current saved rate remains active' : 'Refreshing Google Finance…';
            if (refreshBtn) refreshBtn.classList.add('loading');
            if (!silent && note) note.innerText = 'Checking multiple Google Finance readers…';

            try {
                const { rate: googleSpotRate } = await getUsdCadRate();
                const calculationRate = googleSpotRate + 0.03;
                const fetchedAt = Date.now();
                localStorage.setItem('last_google_usdcad', JSON.stringify({
                    spotRate: googleSpotRate,
                    calculationRate,
                    spread: 0.03,
                    fetchedAt
                }));
                if (googleRateRetryTimer) {
                    clearTimeout(googleRateRetryTimer);
                    googleRateRetryTimer = null;
                }
                return renderGoogleRate(googleSpotRate, { forceApply, updatedAt: fetchedAt });
            } catch (error) {
                console.warn('Live Google Finance refresh failed; retaining last successful rate.', error);
                if (cached) {
                    renderGoogleRate(cached.spotRate, { forceApply, cached: true, updatedAt: cached.fetchedAt });
                } else {
                    if (status) status.innerText = 'Waiting for Google Finance · automatic retry is active';
                    if (note) note.innerText = 'Live refresh is delayed. The app will retry automatically.';
                }
                if (!googleRateRetryTimer) {
                    googleRateRetryTimer = setTimeout(() => {
                        googleRateRetryTimer = null;
                        refreshGoogleRate(false, true);
                    }, 30000);
                }
                return cached ? cached.calculationRate : null;
            } finally {
                if (refreshBtn) refreshBtn.classList.remove('loading');
            }
        }

        function fetchSpotRate() { return refreshGoogleRate(false); }

        // Show the last successful Google rate immediately, then update it in the background.
        const initialCachedGoogleRate = readCachedGoogleRate();
        if (initialCachedGoogleRate) {
            renderGoogleRate(initialCachedGoogleRate.spotRate, {
                cached: true,
                updatedAt: initialCachedGoogleRate.fetchedAt
            });
        }
        refreshGoogleRate(false, Boolean(initialCachedGoogleRate));

        // Refresh every five minutes, when the browser comes online, and when the tab returns.
        setInterval(() => refreshGoogleRate(false, true), 5 * 60 * 1000);
        window.addEventListener('online', () => refreshGoogleRate(false, true));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') refreshGoogleRate(false, true);
        });

        // --- Settings Logic ---
        function populateCountrySelects() {
            const calcSelect = document.getElementById('country-input');
            const setSelect = document.getElementById('settings-country');
            const currentCalcVal = calcSelect.value;
            const currentSetVal = setSelect.value;

            calcSelect.innerHTML = '';
            setSelect.innerHTML = '';

            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.innerText = 'Select a country…';
            placeholder.disabled = true;
            placeholder.selected = true;
            calcSelect.appendChild(placeholder);

            Object.keys(PRICING).forEach(c => {
                const opt1 = document.createElement('option');
                opt1.value = c;
                opt1.innerText = c;
                calcSelect.appendChild(opt1);

                const opt2 = document.createElement('option');
                opt2.value = c;
                opt2.innerText = c;
                setSelect.appendChild(opt2);
            });

            if (currentCalcVal && PRICING[currentCalcVal]) calcSelect.value = currentCalcVal;
            if (currentSetVal && PRICING[currentSetVal]) setSelect.value = currentSetVal;

            const customMenu = document.getElementById('country-options');
            customMenu.innerHTML = '';
            Object.keys(PRICING).forEach(country => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'country-option';
                button.dataset.country = country;
                button.setAttribute('role', 'option');
                button.innerHTML = `${flagImage(countryFlag(country), country + ' flag')}<span>${country}</span>`;
                button.addEventListener('click', () => chooseCountry(country));
                customMenu.appendChild(button);
            });
            syncCountrySelectUI();
            updateSettingsCountryFlag();
        }

        function populateSettingsForm() {
            const countrySelect = document.getElementById('settings-country');
            if (countrySelect.options.length === 0) {
                populateCountrySelects();
            }
            
            const country = countrySelect.value;
            updateSettingsCountryFlag();
            const p = PRICING[country];
            
            const tiersContainer = document.getElementById('set-tiers-container');
            const feesContainer = document.getElementById('set-fees-container');
            const syriaCard = document.getElementById('syria-settings-card');
            const syriaRatesContainer = document.getElementById('syria-rates-container');
            const jordanCard = document.getElementById('jordan-settings-card');

            if (country === 'Jordan') {
                jordanCard.style.display = 'block';
                const jp = PRICING['Jordan'];
                document.getElementById('set-jordan-jodRate').value = jp.jodRate;
                document.getElementById('set-jordan-threshold').value = jp.threshold;
                document.getElementById('set-jordan-flatFee').value = jp.flatFee;
                document.getElementById('set-jordan-pctFee').value = (jp.pctFee * 100).toFixed(2).replace(/\.00$/, '');
            } else {
                jordanCard.style.display = 'none';
            }

            if (country === 'Syria') {
                syriaCard.style.display = 'block';
                let syriaHtml = '';
                Object.entries(SYRIA_RATES.cities).forEach(([city, rates], idx) => {
                    syriaHtml += `
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <div style="width: 120px; font-weight: 500; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${city}">${city}</div>
                            <div class="input-group" style="margin-bottom:0; flex: 1;">
                                <label>USD/SYP</label>
                                <input type="number" id="syp-usd-${idx}" value="${rates.usdSyp}" step="0.5">
                            </div>
                            <div class="input-group" style="margin-bottom:0; flex: 1;">
                                <label>CAD/SYP</label>
                                <input type="number" id="syp-cad-${idx}" value="${rates.cadSyp}" step="0.1">
                            </div>
                        </div>
                    `;
                });
                syriaRatesContainer.innerHTML = syriaHtml;
            } else {
                syriaCard.style.display = 'none';
            }
            
            if (!p) {
                document.getElementById('set-pctRate').value = '';
                document.getElementById('set-usdPayPct').value = '';
                document.getElementById('set-feePct').value = '';
                tiersContainer.innerHTML = '<div style="font-size:12px; color:var(--c-text-muted)">Not configured</div>';
                feesContainer.innerHTML = '';
                return;
            }

            document.getElementById('set-pctRate').value = (p.pctRate * 100).toFixed(2).replace(/\.00$/, '');
            document.getElementById('set-usdPayPct').value = (p.usdPayPct * 100).toFixed(2).replace(/\.00$/, '');
            document.getElementById('set-feePct').value = (p.feePct * 100).toFixed(2).replace(/\.00$/, '');

            let tiersHtml = '';
            for (let i = 0; i < 3; i++) {
                const t = p.tiers[i] || { max: '', add: '' };
                tiersHtml += `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="input-group" style="margin-bottom:0">
                            <input type="number" class="set-tier-max" placeholder="Max USD" value="${t.max}">
                        </div>
                        <div class="input-group" style="margin-bottom:0">
                            <input type="number" class="set-tier-add" placeholder="Add CAD" value="${t.add}">
                        </div>
                    </div>
                `;
            }
            tiersContainer.innerHTML = tiersHtml;

            let feesHtml = '';
            for (let i = 0; i < 4; i++) {
                const f = p.fees[i] || { max: '', amount: '' };
                feesHtml += `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="input-group" style="margin-bottom:0">
                            <input type="number" class="set-fee-max" placeholder="Max USD" value="${f.max}">
                        </div>
                        <div class="input-group" style="margin-bottom:0">
                            <input type="number" class="set-fee-amt" placeholder="Fee USD" value="${f.amount}">
                        </div>
                    </div>
                `;
            }
            feesContainer.innerHTML = feesHtml;
        }

        function saveSyriaRates() {
            let idx = 0;
            Object.keys(SYRIA_RATES.cities).forEach(city => {
                const usd = parseFloat(document.getElementById(`syp-usd-${idx}`).value);
                const cad = parseFloat(document.getElementById(`syp-cad-${idx}`).value);
                if (!isNaN(usd)) SYRIA_RATES.cities[city].usdSyp = usd;
                if (!isNaN(cad)) SYRIA_RATES.cities[city].cadSyp = cad;
                idx++;
            });
            localStorage.setItem('syria_rates', JSON.stringify(SYRIA_RATES));
            const msg = document.getElementById('syria-settings-msg');
            msg.innerText = "SYP Rates saved successfully!";
            setTimeout(() => msg.innerText = "", 3000);
            calculate();
        }

        function updateSyriaRatesToday() {
            const today = new Date().toLocaleDateString('en-CA');
            SYRIA_RATES.lastUpdated = today;
            saveSyriaRates();
            const msg = document.getElementById('syria-settings-msg');
            msg.innerText = "Rates confirmed for today!";
            setTimeout(() => msg.innerText = "", 3000);
        }

        function saveJordanSettings() {
            const jp = PRICING['Jordan'];
            const jodRate = parseFloat(document.getElementById('set-jordan-jodRate').value);
            const threshold = parseFloat(document.getElementById('set-jordan-threshold').value);
            const flatFee = parseFloat(document.getElementById('set-jordan-flatFee').value);
            const pctFee = parseFloat(document.getElementById('set-jordan-pctFee').value);

            if (!isNaN(jodRate) && jodRate > 0) jp.jodRate = jodRate;
            if (!isNaN(threshold) && threshold >= 0) jp.threshold = threshold;
            if (!isNaN(flatFee) && flatFee >= 0) jp.flatFee = flatFee;
            if (!isNaN(pctFee) && pctFee >= 0) jp.pctFee = pctFee / 100;

            localStorage.setItem('fx_pricing', JSON.stringify(PRICING));

            const msg = document.getElementById('jordan-settings-msg');
            msg.innerText = "Jordan settings saved!";
            setTimeout(() => msg.innerText = "", 3000);

            calculate();
        }

        function saveCountrySettings() {
            const country = document.getElementById('settings-country').value;
            if (!PRICING[country]) PRICING[country] = { tiers: [], fees: [] };
            
            const p = PRICING[country];
            
            const pctRate = parseFloat(document.getElementById('set-pctRate').value);
            const usdPayPct = parseFloat(document.getElementById('set-usdPayPct').value);
            const feePct = parseFloat(document.getElementById('set-feePct').value);
            
            if (!isNaN(pctRate)) p.pctRate = pctRate / 100;
            if (!isNaN(usdPayPct)) p.usdPayPct = usdPayPct / 100;
            if (!isNaN(feePct)) p.feePct = feePct / 100;
            
            const tierMaxEls = document.querySelectorAll('.set-tier-max');
            const tierAddEls = document.querySelectorAll('.set-tier-add');
            p.tiers = [];
            for (let i = 0; i < tierMaxEls.length; i++) {
                const max = parseFloat(tierMaxEls[i].value);
                const add = parseFloat(tierAddEls[i].value);
                if (!isNaN(max) && !isNaN(add)) {
                    p.tiers.push({ max, add });
                }
            }
            p.tiers.sort((a,b) => a.max - b.max);
            
            const feeMaxEls = document.querySelectorAll('.set-fee-max');
            const feeAmtEls = document.querySelectorAll('.set-fee-amt');
            p.fees = [];
            for (let i = 0; i < feeMaxEls.length; i++) {
                const max = parseFloat(feeMaxEls[i].value);
                const amt = parseFloat(feeAmtEls[i].value);
                if (!isNaN(max) && !isNaN(amt)) {
                    p.fees.push({ max, amount: amt });
                }
            }
            p.fees.sort((a,b) => a.max - b.max);
            
            localStorage.setItem('fx_pricing', JSON.stringify(PRICING));
            
            const msg = document.getElementById('settings-msg');
            msg.innerText = "Settings saved successfully!";
            setTimeout(() => msg.innerText = "", 3000);
            
            calculate();
        }

        function addNewCountry() {
            const name = prompt("Enter new country name:");
            if (!name || name.trim() === "") return;
            const countryName = name.trim();
            
            if (PRICING[countryName]) {
                alert("Country already exists!");
                document.getElementById('settings-country').value = countryName;
                populateSettingsForm();
                return;
            }
            
            // Create default template for new country
            PRICING[countryName] = {
                tiers: [],
                pctRate: 0.03,
                usdPayPct: 0.04,
                fees: [],
                feePct: 0.01
            };
            
            populateCountrySelects();
            document.getElementById('settings-country').value = countryName;
            document.getElementById('country-input').value = countryName;
            syncCountrySelectUI();
            
            populateSettingsForm();
            saveCountrySettings();
        }

        function resetPricing() {
            if(confirm("Are you sure you want to reset all rates to defaults?")) {
                PRICING = JSON.parse(JSON.stringify(DEFAULT_PRICING));
                localStorage.setItem('fx_pricing', JSON.stringify(PRICING));
                populateSettingsForm();
                const msg = document.getElementById('settings-msg');
                msg.innerText = "Reset to defaults!";
                setTimeout(() => msg.innerText = "", 3000);
                calculate();
            }
        }

// Cosmetic: keep the ticket route strip in sync with the selected corridor.
        function updateTicketDestination() {
            const el = document.getElementById('ticket-destination');
            if (!el) return;
            const country = document.getElementById('country-input').value || 'Corridor';
            syncCountrySelectUI();
            if (country === 'Syria') {
                if (receiveCurrency === 'SYP') {
                    const city = document.getElementById('syria-city-input').value;
                    el.innerText = city ? ('Syria — ' + city) : 'Syria';
                    return;
                }
            }
            el.innerText = country;
        }
        ['country-input', 'syria-city-input', 'amount-input', 'rate-input'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateTicketDestination);
            if (el) el.addEventListener('change', updateTicketDestination);
        });
        document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', updateTicketDestination));
        updateTicketDestination();

        // Cosmetic: the "you send" currency chip mirrors whatever currency the
        // core script put in parentheses in the amount field's label — no need
        // to duplicate that mode/country logic here.
        function updateCurrencyChip() {
            const chip = document.getElementById('amount-currency-chip');
            const label = document.getElementById('amount-label');
            if (!chip || !label) return;
            const match = label.innerText.match(/\(([^)]+)\)/);
            const cur = match ? match[1] : '';
            const flags = { USD: 'us', CAD: 'ca', JOD: 'jo', SYP: 'sy' };
            chip.innerHTML = `${flagImage(flags[cur], cur + ' flag')} ${cur}`;
        }
        const amountLabelEl = document.getElementById('amount-label');
        if (amountLabelEl && window.MutationObserver) {
            new MutationObserver(updateCurrencyChip).observe(amountLabelEl, { childList: true, characterData: true, subtree: true });
        }
        updateCurrencyChip();
