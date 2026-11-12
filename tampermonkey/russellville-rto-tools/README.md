# Russellville RTO Tools v2.0.0 (one Tampermonkey script)
Replaces: Russellville RTO Extra Hauling v1.0.2 and the 50% deposit script v1.0.0. Disable or delete those after installing.

Contracts pages (/contracts/new, /contracts/*/edit): Extra Hauling at $3.00/mile over 60 miles from 3503 Hwy 305, Rich Square, NC 27869 (unchanged).

Manufacturer sales pages (/manufacturer_sales/new, /manufacturer_sales/*/edit):
- Deposit set to 50% of the total incl. tax on load, on tax-rate change, and with the red button.
- Serial: Coastal format N1 + size (0816) + style + options + MMDDYY + h:mm sold time. Fills only while the serial still equals the contract number; blue button forces a rebuild.
- County box becomes a dropdown of 33 counties within 50 miles of Princeton, Dunn, and La Grange. Picking one fills the tax rate and redoes the deposit.
- Tax rates: NCDOR, effective July 1, 2026, stored in COUNTY_RATES near the top of Part 2. Sampson voters approved an increase that NCDOR has not posted yet; 7.00% is used until it does.
- Create quote PDF: a floating button on manufacturer sales pages downloads a branded Hinton Buildings quote with customer info, lot address, building details, price, tax, total, deposit, and balance due.
Tested in a simulated page: deposit $1,947.12 on $3,894.24; Harnett gives 7% and deposit $1,951.68.
