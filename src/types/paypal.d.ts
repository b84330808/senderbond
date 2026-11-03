// Minimal typings for the PayPal JavaScript SDK v6 surface SenderBond uses.

type PayPalOneTimePaymentSession = {
  start(options: { presentationMode: "auto" | "popup" | "modal" | "redirect" }, order: Promise<{ orderId: string }>): Promise<void>;
};

type PayPalSdkInstance = {
  findEligibleMethods(options: { currencyCode: string }): Promise<{ isEligible(method: string): boolean }>;
  createPayPalOneTimePaymentSession(options: {
    onApprove: (data: { orderId: string }) => Promise<void> | void;
    onCancel?: (data: { orderId?: string }) => void;
    onError?: (error: Error) => void;
  }): PayPalOneTimePaymentSession;
};

interface Window {
  paypal?: {
    createInstance(options: {
      clientId: string;
      components: string[];
      pageType?: string;
      locale?: string;
    }): Promise<PayPalSdkInstance>;
  };
}

declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      "paypal-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { type?: string };
    }
  }
}
