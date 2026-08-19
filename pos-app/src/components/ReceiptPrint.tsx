"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { formatEurFromCzk } from "@/lib/currency";
import {
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptTime,
  type ReceiptData,
} from "@/lib/receipt-calculations";
import type { ReceiptBrandingVisibility } from "@/lib/receipt-branding";
import { DEFAULT_RECEIPT_BRANDING_VISIBILITY } from "@/lib/receipt-branding";
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
  visibility: ReceiptBrandingVisibility;
}

interface ReceiptPrintProps {
  data: ReceiptData | null;
  template?: ReceiptTemplate;
}

const DASH_LINE = "------------------------------------------";

function resolveTemplate(data: ReceiptData, template?: ReceiptTemplate): ReceiptTemplate {
  if (template) {
    return {
      ...template,
      visibility: template.visibility ?? { ...DEFAULT_RECEIPT_BRANDING_VISIBILITY },
    };
  }
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
      visibility: { ...DEFAULT_RECEIPT_BRANDING_VISIBILITY },
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
    visibility: { ...DEFAULT_RECEIPT_BRANDING_VISIBILITY },
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
    visibility: settings.receiptBrandingVisibility,
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

export type ReceiptTemplateDraft = Pick<
  AppSettings,
  | "receiptHeaderTitle"
  | "receiptAddress"
  | "receiptLegalName"
  | "receiptCompanyAddress"
  | "receiptIco"
  | "receiptDic"
  | "receiptPhone"
  | "receiptFooterNote"
  | "receiptBrandingVisibility"
>;

export function draftToReceiptTemplate(draft: ReceiptTemplateDraft): ReceiptTemplate {
  return {
    brandName: draft.receiptHeaderTitle,
    brandAddress: draft.receiptAddress,
    legalName: draft.receiptLegalName,
    companyAddress: draft.receiptCompanyAddress,
    ico: draft.receiptIco,
    dic: draft.receiptDic,
    phone: draft.receiptPhone,
    footerLines: draft.receiptFooterNote
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    visibility: draft.receiptBrandingVisibility,
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
  const vis = biz.visibility;

  const showSubtotal =
    data.discountAmount > 0 ||
    data.tip > 0 ||
    Math.abs(data.subtotal - data.grandTotal) > 0.009;

  return (
    <>
      <header className="receipt-header receipt-header-czech">
        <p className="receipt-bill-id">Č.: {data.orderNumber}</p>
        {vis.showHeaderTitle && biz.brandName.trim() ? (
          <h1 className="receipt-title">{biz.brandName}</h1>
        ) : null}
        {vis.showBrandAddress && biz.brandAddress.trim() ? (
          <p className="receipt-center">{biz.brandAddress}</p>
        ) : null}
        {vis.showLegalName && biz.legalName.trim() ? (
          <p className="receipt-center">{biz.legalName}</p>
        ) : null}
        {vis.showCompanyAddress && biz.companyAddress.trim() ? (
          <p className="receipt-center">{biz.companyAddress}</p>
        ) : null}
        {vis.showIcoDic && (biz.ico.trim() || biz.dic.trim()) ? (
          <p className="receipt-center">
            IČO: {biz.ico}&nbsp;&nbsp;&nbsp;DIČ: {biz.dic}
          </p>
        ) : null}

        <div className="receipt-meta-row">
          <div className="receipt-meta-left">
            {vis.showPhone && biz.phone.trim() ? <span>Tel: {biz.phone}</span> : null}
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
          <span className="receipt-items-head-left">Položka</span>
          <span className="receipt-items-head-right">Částka</span>
        </div>
        {data.items.map((item, idx) => (
          <div key={`${item.name}-${idx}`} className="receipt-item-czech">
            <span className="receipt-item-left">{item.name}</span>
            <span className="receipt-item-right">
              {formatReceiptAmount(item.lineTotal)} {item.taxGroup}
            </span>
          </div>
        ))}
      </section>

      <p className="receipt-dash">{DASH_LINE}</p>

      <section className="receipt-totals-czech">
        {showSubtotal && (
          <div className="receipt-total-row">
            <span>Mezisoučet:</span>
            <span className="receipt-total-value">{formatReceiptAmount(data.subtotal)}</span>
          </div>
        )}
        {data.discountAmount > 0 && (
          <div className="receipt-total-row">
            <span>{data.discountLabel ?? "Sleva:"}</span>
            <span className="receipt-total-value">{formatReceiptAmount(data.discountAmount)}</span>
          </div>
        )}
        {data.tip > 0 && (
          <div className="receipt-total-row">
            <span>Spropitné:</span>
            <span className="receipt-total-value">{formatReceiptAmount(data.tip)}</span>
          </div>
        )}
        <div className="receipt-celkem-row">
          <span>CELKEM</span>
          <span className="receipt-total-value">{formatReceiptAmount(data.grandTotal)}</span>
        </div>
        {data.showEur && (
          <p className="receipt-center">
            ≈ {formatEurFromCzk(data.grandTotal, data.eurRate)}
          </p>
        )}
        <div className="receipt-total-row receipt-payment-row">
          <span className="receipt-payment-line">{paymentMethodLabel(data.paymentMethod)}</span>
          <span className="receipt-total-value">{formatReceiptAmount(data.grandTotal)}</span>
        </div>
        {data.paymentMethod === "cash" && data.amountGiven != null && (
          <>
            <div className="receipt-total-row">
              <span>Přijato:</span>
              <span className="receipt-total-value">{formatReceiptAmount(data.amountGiven)}</span>
            </div>
            <div className="receipt-total-row receipt-total-row--bold">
              <span>Vráceno:</span>
              <span className="receipt-total-value">{formatReceiptAmount(data.changeDue ?? 0)}</span>
            </div>
          </>
        )}
      </section>

      <CardPaymentReceiptSection data={data} />

      <p className="receipt-dash">{DASH_LINE}</p>

      <table className="receipt-vat-grid">
        <thead>
          <tr>
            <th className="receipt-vat-th-left" />
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
        {vis.showFooter
          ? biz.footerLines.map((line) => <p key={line}>{line}</p>)
          : null}
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
