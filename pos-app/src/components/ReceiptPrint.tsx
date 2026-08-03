"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { formatEurFromCzk } from "@/lib/currency";
import {
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptDisplayIndex,
  formatReceiptTime,
  type ReceiptData,
} from "@/lib/receipt-calculations";
import type { AppSettings } from "@/lib/types";

export interface ReceiptTemplate {
  brandName: string;
  brandAddress: string;
  legalName: string;
  companyAddress: string;
  ico: string;
  dic: string;
  phone: string;
  footerLines: string[];
}

interface ReceiptPrintProps {
  data: ReceiptData | null;
  template?: ReceiptTemplate;
}

const DASH_LINE = "------------------------------------------";

function resolveTemplate(data: ReceiptData, template?: ReceiptTemplate): ReceiptTemplate {
  if (template) return template;
  if (data.business) {
    return {
      brandName: data.business.brandName,
      brandAddress: data.business.brandAddress,
      legalName: data.business.legalName,
      companyAddress: data.business.companyAddress,
      ico: data.business.ico,
      dic: data.business.dic,
      phone: data.business.phone,
      footerLines: data.business.footerLines,
    };
  }
  return {
    brandName: "JIN CHENG",
    brandAddress: "Václavské nám. 819, 110 00 Praha",
    legalName: "JING DE INTER.TRADE, s.r.o.",
    companyAddress: "Václavské náměstí 819/43, 110 00 Praha",
    ico: "25682199",
    dic: "CZ25682199",
    phone: "+420 222 240 429",
    footerLines: [
      "Děkujeme za Vaši návštěvu!",
      "Otevírací doba: Po-Ne 10:00-22:00",
    ],
  };
}

export function settingsToReceiptTemplate(settings: AppSettings): ReceiptTemplate {
  return {
    brandName: settings.receiptHeaderTitle,
    brandAddress: settings.receiptAddress,
    legalName: settings.receiptLegalName,
    companyAddress: settings.receiptCompanyAddress,
    ico: settings.receiptIco,
    dic: settings.receiptDic,
    phone: settings.receiptPhone,
    footerLines: settings.receiptFooterNote
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

export function settingsToReceiptBusiness(settings: AppSettings): ReceiptData["business"] {
  const template = settingsToReceiptTemplate(settings);
  return {
    brandName: template.brandName,
    brandAddress: template.brandAddress,
    legalName: template.legalName,
    companyAddress: template.companyAddress,
    ico: template.ico,
    dic: template.dic,
    phone: template.phone,
    footerLines: template.footerLines,
  };
}

function paymentMethodLabel(method: ReceiptData["paymentMethod"]): string {
  return method === "cash" ? "hotovost" : "debetní karta";
}

function formatCardMask(last4: string): string {
  return `**** **** **** ${last4}`;
}

function CardPaymentReceiptSection({ data }: { data: ReceiptData }) {
  if (data.paymentMethod !== "card" || !data.cardLast4) return null;

  return (
    <>
      <p className="receipt-dash">{DASH_LINE}</p>
      <section className="receipt-card-payment">
        <p className="receipt-center receipt-card-payment-title">PLATBA KARTOU / CARD PAYMENT</p>
        <p className="receipt-center">
          Karta: {data.cardBrand ?? "Card"} ({formatCardMask(data.cardLast4)})
        </p>
        {data.cardAuthCode && (
          <p className="receipt-center">Auth Code: {data.cardAuthCode}</p>
        )}
        <p className="receipt-center">Trans. Status: SCHVÁLENO / APPROVED</p>
      </section>
    </>
  );
}

export function ReceiptBodyContent({
  data,
  template,
}: {
  data: ReceiptData;
  template?: ReceiptTemplate;
}) {
  const biz = resolveTemplate(data, template);
  const displayIndex = formatReceiptDisplayIndex(data.orderNumber);

  return (
    <>
      <header className="receipt-header receipt-header-czech">
        <p className="receipt-index">{displayIndex}</p>
        <p className="receipt-bill-id">Č.: {data.orderNumber}</p>
        <h1 className="receipt-title">{biz.brandName}</h1>
        <p className="receipt-center">{biz.brandAddress}</p>
        <p className="receipt-center">{biz.legalName}</p>
        <p className="receipt-center">{biz.companyAddress}</p>
        <p className="receipt-center">
          IČO: {biz.ico}&nbsp;&nbsp;&nbsp;DIČ: {biz.dic}
        </p>

        <div className="receipt-meta-row">
          <div className="receipt-meta-left">
            <span>Tel: {biz.phone}</span>
            <span>Stůl č. {data.tableLabel}</span>
          </div>
          <div className="receipt-meta-right">
            <span>Datum: {formatReceiptDate(data.closedAt)}</span>
            <span>Čas: {formatReceiptTime(data.closedAt)}</span>
          </div>
        </div>
      </header>

      <p className="receipt-dash">{DASH_LINE}</p>

      <section className="receipt-items-czech">
        <div className="receipt-items-head">
          <span className="receipt-items-head-left">Kód Položka</span>
          <span className="receipt-items-head-right">Částka</span>
        </div>
        {data.items.map((item, idx) => (
          <div key={`${item.code}-${idx}`} className="receipt-item-czech">
            <span className="receipt-item-left">
              {item.code} {item.name}
            </span>
            <span className="receipt-item-right">
              {item.quantity} {formatReceiptAmount(item.lineTotal)} {item.taxGroup}
            </span>
          </div>
        ))}
      </section>

      <p className="receipt-dash">{DASH_LINE}</p>

      <section className="receipt-totals-czech">
        <div className="receipt-total-row">
          <span>Mezisoučet:</span>
          <span className="receipt-total-value">{formatReceiptAmount(data.subtotal)} CZK</span>
        </div>
        {data.discountAmount > 0 && (
          <div className="receipt-total-row">
            <span>{data.discountLabel ?? "Sleva:"}</span>
            <span className="receipt-total-value">{formatReceiptAmount(data.discountAmount)} CZK</span>
          </div>
        )}
        <div className="receipt-celkem-row">
          <span>CELKEM</span>
          <span className="receipt-total-value">{formatReceiptAmount(data.grandTotal)} CZK</span>
        </div>
        {data.showEur && (
          <p className="receipt-center">
            ≈ {formatEurFromCzk(data.grandTotal, data.eurRate)}
          </p>
        )}
        <p className="receipt-payment-line">{paymentMethodLabel(data.paymentMethod)}</p>
        {data.paymentMethod === "cash" && data.amountGiven != null && (
          <>
            <div className="receipt-total-row">
              <span>Přijato:</span>
              <span className="receipt-total-value">{formatReceiptAmount(data.amountGiven)} CZK</span>
            </div>
            <div className="receipt-total-row receipt-total-row--bold">
              <span>Vráceno:</span>
              <span className="receipt-total-value">{formatReceiptAmount(data.changeDue ?? 0)} CZK</span>
            </div>
          </>
        )}
      </section>

      <CardPaymentReceiptSection data={data} />

      <p className="receipt-dash">{DASH_LINE}</p>

      <table className="receipt-vat-grid">
        <thead>
          <tr>
            <th className="receipt-vat-th-left">Rate (%)</th>
            <th className="receipt-vat-th-right">DPH</th>
            <th className="receipt-vat-th-right">Základ</th>
          </tr>
        </thead>
        <tbody>
          {data.taxGroups.map((row) => (
            <tr key={row.group}>
              <td className="receipt-vat-td-left">{row.rate}</td>
              <td className="receipt-vat-td-right">{formatReceiptAmount(row.vat)}</td>
              <td className="receipt-vat-td-right">{formatReceiptAmount(row.base)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="receipt-footer-czech">
        {biz.footerLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </footer>
    </>
  );
}

function ReceiptPrintGlobalStyles() {
  return (
    <style jsx global>{`
      #print-portal {
        position: fixed;
        left: -9999px;
        top: 0;
        width: 78mm;
        opacity: 0;
        pointer-events: none;
        z-index: -1;
      }
    `}</style>
  );
}

export function ReceiptPrint({ data, template }: ReceiptPrintProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <ReceiptPrintGlobalStyles />
      {mounted &&
        data &&
        createPortal(
          <div id="print-portal">
            <div id="printable-receipt" className="receipt-print-80mm">
              <div className="receipt-inner receipt-czech receipt-sheet">
                <ReceiptBodyContent data={data} template={template} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
