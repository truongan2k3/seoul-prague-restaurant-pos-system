# Customer display tipping

The `/client` checkout offers 5%, 10%, 15%, 20% and No Tip. No paid
percentage is preselected. Existing staff-entered tips remain visible until
the guest makes a choice or staff changes the tip.

The POS computes all five previews with `buildCheckoutTotals`. The base is
the discounted food subtotal for the current payment share, before tips.
Vouchers remain tender: their capped credit is subtracted once from the
payable total, without reducing the tip base. Guest tips replace manual,
round-up and keep-change tips; they do not accumulate with them.

The existing CFD snapshot, Postgres subscription, welcome/slideshow logic
and persistence debounce are retained. One shared Supabase broadcast topic,
`cfd_tip_selection`, carries guest commands and POS acknowledgments. It adds
no polling, schema changes or per-choice database reads. Only the POS writes
the existing checkout snapshot; selecting a tip never creates a sale.

Commands identify the checkout and bill revision. Bill, discount, voucher,
order, and split-guest changes invalidate the selection and old commands.
Payment submission locks incoming choices. Failed payments return `false`
from the checkout callback, retaining the draft without advancing the split
or playing the success sound. Sale persistence remains in the existing
successful-payment path.

The client previews the total immediately, then accepts the POS response.
A missing acknowledgment rolls back the preview after seven seconds with
a retry message; an updated persisted snapshot can also confirm the choice.
Selection versions prevent delayed responses from overwriting newer choices.

Run the calculation and protocol checks from `pos-app`:

```sh
npm exec --yes --package=tsx -- tsx --test lib/cfd-tip.test.ts
npx tsc --noEmit
```

Browser verification should use two separate contexts (POS and `/client`):
switch percentages rapidly, apply a discount and voucher, change the bill,
cancel/reopen checkout, switch orders, and fail/retry payment. Verify that
No Tip is the default, the staff tip matches, stale taps are rejected, and
only successful payment records the selected tip. Also verify phone/tablet
layouts, keyboard focus, and reduced motion. Live cross-device verification
requires access to the configured Supabase project's HTTPS/WebSocket endpoints.
