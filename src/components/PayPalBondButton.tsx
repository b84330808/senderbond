"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

// Posts the bond with the PayPal JS SDK v6. The server creates an Orders v2
// order with intent AUTHORIZE; after approval it authorizes (holds) the funds.

let sdkPromise: Promise<void> | null = null;

function loadSdk(url: string): Promise<void> {
  if (window.paypal) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        sdkPromise = null;
        reject(new Error("Could not load the PayPal SDK"));
      };
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

export function PayPalBondButton({ campaignId, onAuthorized }: { campaignId: string; onAuthorized: () => void }) {
  const buttonRef = useRef<HTMLElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "working" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const config = await api<{ paypalClientId: string; paypalSdkUrl: string }>("/api/config");
        await loadSdk(config.paypalSdkUrl);
        const sdk = await window.paypal!.createInstance({
          clientId: config.paypalClientId,
          components: ["paypal-payments"],
          pageType: "checkout",
          locale: "en-US",
        });
        const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
        if (cancelled) return;
        if (!methods.isEligible("paypal")) throw new Error("PayPal is not available for this browser");

        const session = sdk.createPayPalOneTimePaymentSession({
          async onApprove(data) {
            setState("working");
            setMessage("Holding the bond…");
            try {
              await api(`/api/campaigns/${campaignId}/bond/authorize`, { body: { orderId: data.orderId } });
              setMessage(null);
              onAuthorized();
            } catch (err) {
              setState("ready");
              setMessage((err as Error).message);
            }
          },
          onCancel() {
            setState("ready");
            setMessage("Bond not posted. You can try again.");
          },
          onError(error) {
            setState("ready");
            setMessage(error.message);
          },
        });

        const onClick = () => {
          setMessage(null);
          const order = api<{ orderId: string }>(`/api/campaigns/${campaignId}/bond`, { body: {} });
          session.start({ presentationMode: "auto" }, order).catch((err: Error) => setMessage(err.message));
        };
        const button = buttonRef.current!;
        button.addEventListener("click", onClick);
        button.removeAttribute("hidden");
        cleanup = () => button.removeEventListener("click", onClick);
        setState("ready");
      } catch (err) {
        if (!cancelled) {
          setState("error");
          setMessage((err as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [campaignId, onAuthorized]);

  return (
    <div className="space-y-2">
      <div className={state === "working" ? "pointer-events-none opacity-50" : ""}>
        <paypal-button ref={buttonRef} type="pay" hidden></paypal-button>
      </div>
      {state === "loading" && <p className="text-sm text-zinc-500">Loading PayPal…</p>}
      {message && <p className={`text-sm ${state === "error" ? "text-red-600" : "text-zinc-600"}`}>{message}</p>}
    </div>
  );
}
