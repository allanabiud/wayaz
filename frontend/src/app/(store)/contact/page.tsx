import type { Metadata } from "next";
import { ContactForm } from "@/components/store/contact-form";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the Wayaz team. Inquire about orders, product availability, or general questions.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold tracking-[0.25em] text-gold uppercase">
          Get in Touch
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Contact Us
        </h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Have a question about an order, styling advice, or wholesale inquiries? Send us a message or reach out via our direct lines below.
        </p>
      </div>

      <div className="mt-12">
        <ContactForm />
      </div>
    </div>
  );
}
