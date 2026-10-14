"use client";

import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  TwitterIcon,
  WhatsAppIcon,
  YouTubeIcon,
} from "@/components/brand-icons";
import { useStore } from "@/components/store/store-context";
import { api, ApiError } from "@/lib/api";
import { waLink } from "@/lib/store";

export function ContactForm() {
  const { settings } = useStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/api/v1/catalog/contact/", {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        subject: subject.trim(),
        message: message.trim(),
      });
      setSubmitted(true);
      toast.success("Thank you! Your message has been sent.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to send message. Please try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const waNum = settings?.whatsapp_number || process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "254700000000";
  const waMsg = settings?.whatsapp_message || "Hi Wayaz, I'd like to get in touch.";

  return (
    <div className="grid gap-10 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-1">
        <Card className="border shadow-xs">
          <CardContent className="p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold tracking-tight">Direct Channels</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                We typically respond within an hour during business hours.
              </p>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <WhatsAppIcon className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase">WhatsApp</p>
                  <a
                    href={waLink(waMsg, waNum)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:text-emerald-600 transition-colors"
                  >
                    Chat on WhatsApp
                  </a>
                </div>
              </div>

              {settings?.support_phones && settings.support_phones.length > 0 ? (
                settings.support_phones.map((p, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="rounded-full bg-primary/10 p-2 text-primary shrink-0">
                      <Phone className="size-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">{p.label}</p>
                      <a
                        href={`tel:${p.number.replace(/\s+/g, "")}`}
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {p.number}
                      </a>
                    </div>
                  </div>
                ))
              ) : settings?.contact_phone ? (
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 text-primary shrink-0">
                    <Phone className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Phone</p>
                    <a
                      href={`tel:${settings.contact_phone.replace(/\s+/g, "")}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {settings.contact_phone}
                    </a>
                  </div>
                </div>
              ) : null}

              {settings?.contact_email && (
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 text-primary shrink-0">
                    <Mail className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Email</p>
                    <a
                      href={`mailto:${settings.contact_email}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {settings.contact_email}
                    </a>
                  </div>
                </div>
              )}

              {settings?.address && (
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 text-primary shrink-0">
                    <MapPin className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Location</p>
                    <p className="font-medium">{settings.address}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Follow Us</p>
              <div className="flex items-center gap-3">
                {settings?.instagram_url && (
                  <a
                    href={settings.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Instagram"
                  >
                    <InstagramIcon className="size-4" />
                  </a>
                )}
                {settings?.facebook_url && (
                  <a
                    href={settings.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Facebook"
                  >
                    <FacebookIcon className="size-4" />
                  </a>
                )}
                {settings?.tiktok_url && (
                  <a
                    href={settings.tiktok_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="TikTok"
                  >
                    <TikTokIcon className="size-4" />
                  </a>
                )}
                {settings?.twitter_url && (
                  <a
                    href={settings.twitter_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="X (Twitter)"
                  >
                    <TwitterIcon className="size-4" />
                  </a>
                )}
                {settings?.youtube_url && (
                  <a
                    href={settings.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="YouTube"
                  >
                    <YouTubeIcon className="size-4" />
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card className="border shadow-xs">
          <CardContent className="p-6 sm:p-8">
            {submitted ? (
              <div className="py-12 text-center space-y-4">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 className="size-6" />
                </div>
                <h3 className="text-lg font-bold">Message Sent Successfully!</h3>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                  Thank you for reaching out to us. A member of our team will get back to you shortly at <strong>{email}</strong>.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSubmitted(false);
                    setName("");
                    setEmail("");
                    setPhone("");
                    setSubject("");
                    setMessage("");
                  }}
                  className="mt-4"
                >
                  Send Another Message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-name" className="text-xs font-semibold">
                      Your Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="contact-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      required
                      maxLength={120}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contact-email" className="text-xs font-semibold">
                      Email Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="contact-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@example.com"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-phone" className="text-xs font-semibold">
                      Phone Number (optional)
                    </Label>
                    <Input
                      id="contact-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+254 712 345 678"
                      maxLength={30}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contact-subject" className="text-xs font-semibold">
                      Subject <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="contact-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Inquiry about order..."
                      required
                      maxLength={200}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-message" className="text-xs font-semibold">
                    Message <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="contact-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Write your message or inquiry here..."
                    required
                    rows={5}
                    maxLength={2000}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Sending Message…
                    </>
                  ) : (
                    <>
                      <Send className="size-4" />
                      Send Message
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
