const btnOnramp = document.getElementById("btn-onramp");
const btnOnrampAlt = document.getElementById("btn-onramp-alt");
const btnSwap = document.getElementById("btn-swap");
const btnGiftcards = document.getElementById("btn-giftcards");

const onrampHint = document.getElementById("onramp-hint");
const swapHint = document.getElementById("swap-hint");
const giftcardHint = document.getElementById("giftcard-hint");

// Configure these at deploy time to avoid hardcoding a specific vendor.
// Example (cards): Ramp / Transak / MoonPay hosted checkout URLs.
// Example (swap): Jupiter swap URL pointing to your token mint.
const ONRAMP_URL =
  window.CLAW_ONRAMP_URL ||
  "https://onramper.com/?defaultCrypto=SOL&defaultFiat=USD&isAddressEditable=true";

const ONRAMP_URL_ALT =
  window.CLAW_ONRAMP_URL_ALT ||
  "https://onramper.com/?defaultCrypto=USDC_SOL&defaultFiat=USD&isAddressEditable=true";

const SWAP_URL =
  window.CLAW_SWAP_URL ||
  "https://jup.ag/swap";

// Gift card support should be a link-out to a licensed third-party.
// Do NOT attempt to redeem gift cards on your own infrastructure.
const GIFTCARD_URL =
  window.CLAW_GIFTCARD_URL ||
  "https://www.onramper.com/";

function setLink(a, url) {
  if (!a) return;
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
}

setLink(btnOnramp, ONRAMP_URL);
setLink(btnOnrampAlt, ONRAMP_URL_ALT);
setLink(btnSwap, SWAP_URL);
setLink(btnGiftcards, GIFTCARD_URL);

if (onrampHint) {
  onrampHint.textContent =
    "Tip: use a dedicated wallet for separation. Card providers often require KYC/AML.";
}

if (swapHint) {
  swapHint.textContent =
    "Tip: set window.CLAW_SWAP_URL to a direct Jupiter link for your mint. Keep a little SOL for fees.";
}

if (giftcardHint) {
  giftcardHint.textContent =
    "Tip: legitimate gift-card flows rarely preserve anonymity; rates and requirements vary by provider.";
}
