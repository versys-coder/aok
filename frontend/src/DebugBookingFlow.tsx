import { useMemo, useState } from "react";

import PhoneForm from "wizard/components/PhoneForm";
import SmsForm from "wizard/components/SmsForm";
import Success from "wizard/components/Success";
import Payment from "wizard/components/Payment";
import PaymentSuccess from "wizard/components/PaymentSuccess";

type Step = 3 | 4 | 5 | "payment" | "paid";

export type Slot = {
  start_date: string;        // ISO: 2025-12-19T08:00:00
  appointment_id: string | null;
  serviceId: string;
  serviceName: string;
  // доп. поля (не обязательны для wizard)
  free?: number;
  total?: number;
};

const DEFAULT_PAYMENT_SERVICE_ID =
  "9672bb23-7060-11f0-a902-00583f11e32d";

function formatBookingLine(start: string) {
  const d = new Date(start);

  if (isNaN(d.getTime())) return "";

  const weekday = d.toLocaleDateString("ru-RU", { weekday: "long" });
  const dayMonth = d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
  });
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${weekday}, ${dayMonth} в ${hh}:${mm}`;
}

export default function DebugBookingFlow({ slot }: { slot: Slot }) {
  const [step, setStep] = useState<Step>(3);

  const phone = "79990001122";

  const client = useMemo(
    () => ({
      booking: { id: "debug-booking" },
      client_name: "Debug Client",
      client_id: "debug-client",
      phone,
    }),
    [phone]
  );

  return (
    <>
      {/* DEBUG STEP BAR */}
      <div className="dbg-stepbar">
        {[3, 4, 5, "payment", "paid"].map((s) => (
          <button key={String(s)} onClick={() => setStep(s as Step)}>
            {String(s).toUpperCase()}
          </button>
        ))}
      </div>

      {/* HEADER */}
      <div className="dbg-booking-head">
        <div className="dbg-booking-title">БРОНИРОВАНИЕ</div>
        <div className="dbg-booking-service">{slot.serviceName}</div>
        <div className="dbg-booking-datetime">
          {formatBookingLine(slot.start_date)}
        </div>
      </div>

      {/* STEPS */}
      {step === 3 && (
        <PhoneForm
          slot={slot}
          initialPhone={phone}
          onSubmit={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <SmsForm
          slot={slot}
          phone={phone}
          onBack={() => setStep(3)}
          onComplete={() => setStep(5)}
        />
      )}

      {step === 5 && (
        <Success client={client} onPay={() => setStep("payment")} />
      )}

      {step === "payment" && (
        <Payment
          serviceId={DEFAULT_PAYMENT_SERVICE_ID}
          serviceName={slot.serviceName}
          startDateTime={slot.start_date}
          phone={phone}
          onPaid={() => setStep("paid")}
        />
      )}

      {step === "paid" && (
        <PaymentSuccess
          client={client}
          startDateTime={slot.start_date}
        />
      )}
    </>
  );
}
