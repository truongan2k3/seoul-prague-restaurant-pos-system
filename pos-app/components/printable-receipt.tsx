"use client";

import {
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptTime,
  RECEIPT_BUSINESS,
  type ReceiptData,
} from "@/lib/receipt-calculations";
import { formatEurFromCzk, formatUsdFromCzk } from "@/lib/currency";

interface PrintableReceiptProps {
  data: ReceiptData | null;
}

function ReceiptLine({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`receipt-row ${bold ? "receipt-row--bold" : ""}`}>
      <span>{label}</span>
      <span className="receipt-amount">{value}</span>
    </div>
  );
}

export function PrintableReceipt({ data }: PrintableReceiptProps) {
  if (!data) return null;

  const paymentLabel =
    data.paymentMethod === "cash" ? "Hotově" : "Kartou";

  return (
    <div id="printable-receipt" className="printable-receipt" aria-hidden="true">
      <div className="receipt-inner">
        <header className="receipt-header">
          <p className="receipt-order">Číslo objednávky: {data.orderNumber}</p>
          <h1 className="receipt-title">{RECEIPT_BUSINESS.name}</h1>
          <p>{RECEIPT_BUSINESS.address}</p>
          <p>IČO: {RECEIPT_BUSINESS.ico}</p>
          <p>DIČ: {RECEIPT_BUSINESS.dic}</p>
          <p>Tel: {RECEIPT_BUSINESS.tel}</p>
          <p>
            Datum: {formatReceiptDate(data.closedAt)} &nbsp; Čas:{" "}
            {formatReceiptTime(data.closedAt)}
          </p>
          <p>Stůl: {data.tableLabel}</p>
          {data.staffName && <p>Obsluha: {data.staffName}</p>}
        </header>

        <div className="receipt-divider" />

        <section className="receipt-items">
          {data.items.map((item, idx) => (
            <div key={`${item.code}-${idx}`} className="receipt-item-line">
              <span className="receipt-item-code">{item.code}</span>
              <span className="receipt-item-name">{item.name}</span>
              <span className="receipt-item-qty">{item.quantity}</span>
              <span className="receipt-item-price">{formatReceiptAmount(item.lineTotal)}</span>
              <span className="receipt-item-tax">{item.taxGroup}</span>
            </div>
          ))}
        </section>

        <div className="receipt-divider" />

        <section className="receipt-totals">
          <ReceiptLine label="Mezisoučet" value={formatReceiptAmount(data.subtotal)} />
          {data.discountAmount > 0 && (
            <ReceiptLine label="Sleva" value={`-${formatReceiptAmount(data.discountAmount)}`} />
          )}
          {data.tip > 0 && (
            <ReceiptLine label="Tip" value={formatReceiptAmount(data.tip)} />
          )}
          <div className="receipt-celkem">
            <span>CELKEM</span>
            <span>{formatReceiptAmount(data.grandTotal)} Kč</span>
          </div>
          {data.showEur && (
            <p className="receipt-alt-currency">
              ≈ {formatEurFromCzk(data.grandTotal, data.eurRate)}
            </p>
          )}
          {data.showUsd && (
            <p className="receipt-alt-currency">
              ≈ {formatUsdFromCzk(data.grandTotal, data.usdRate)}
            </p>
          )}
        </section>

        <div className="receipt-divider" />

        <section className="receipt-payment">
          <p>Platba: {paymentLabel}</p>
          {data.paymentMethod === "cash" && data.amountGiven != null && (
            <>
              <ReceiptLine label="Přijato" value={`${formatReceiptAmount(data.amountGiven)} Kč`} />
              <ReceiptLine
                label="Vráceno"
                value={`${formatReceiptAmount(data.changeDue ?? 0)} Kč`}
                bold
              />
            </>
          )}
        </section>

        <div className="receipt-divider" />

        <section className="receipt-vat">
          <p className="receipt-vat-title">Rozpis DPH</p>
          {data.taxGroups.map((row) => (
            <div key={row.group} className="receipt-vat-group">
              <p className="receipt-vat-heading">
                Skupina {row.group} ({row.rate} %)
              </p>
              <ReceiptLine label="Základ" value={`${formatReceiptAmount(row.base)} Kč`} />
              <ReceiptLine label="DPH" value={`${formatReceiptAmount(row.vat)} Kč`} />
            </div>
          ))}
        </section>

        <div className="receipt-divider" />

        <footer className="receipt-footer">
          <p>{RECEIPT_BUSINESS.footer}</p>
        </footer>
      </div>
    </div>
  );
}
