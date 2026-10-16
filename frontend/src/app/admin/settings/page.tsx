"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Smartphone,
  Store,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, PageHeader } from "@/components/ui/states";
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  TwitterIcon,
  WhatsAppIcon,
  YouTubeIcon,
} from "@/components/brand-icons";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/use-query";
import type { StoreSettings, SupportPhone } from "@/lib/types";

export default function AdminSettingsPage() {
  const { data, error, loading, refetch } = useQuery<StoreSettings>(() =>
    api.get<StoreSettings>("/api/v1/admin/settings/"),
  );

  const [saving, setSaving] = useState(false);

  const [storeName, setStoreName] = useState("");
  const [tagline, setTagline] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [supportPhones, setSupportPhones] = useState<SupportPhone[]>([]);
  const [contactEmail, setContactEmail] = useState("");
  const [address, setAddress] = useState("");
  const [mpesaShortcode, setMpesaShortcode] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [announcementText, setAnnouncementText] = useState("");
  const [isAnnouncementActive, setIsAnnouncementActive] = useState(false);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [clearLogo, setClearLogo] = useState(false);

  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [clearFavicon, setClearFavicon] = useState(false);

  // Sync form state during render when data loads (the react.dev
  // "adjusting state when a prop changes" pattern) rather than in an effect.
  const [syncedData, setSyncedData] = useState<StoreSettings | null>(null);
  if (data && data !== syncedData) {
    setSyncedData(data);
    setStoreName(data.store_name || "");
    setTagline(data.tagline || "");
    setWhatsappNumber(data.whatsapp_number || "");
    setWhatsappMessage(data.whatsapp_message || "");
    setContactPhone(data.contact_phone || "");
    setSupportPhones(
      Array.isArray(data.support_phones) ? data.support_phones : [],
    );
    setContactEmail(data.contact_email || "");
    setAddress(data.address || "");
    setInstagramUrl(data.instagram_url || "");
    setFacebookUrl(data.facebook_url || "");
    setTiktokUrl(data.tiktok_url || "");
    setTwitterUrl(data.twitter_url || "");
    setYoutubeUrl(data.youtube_url || "");
    setAnnouncementText(data.announcement_text || "");
    setIsAnnouncementActive(Boolean(data.is_announcement_active));
    setMpesaShortcode(data.mpesa_shortcode || "");

    setLogoFile(null);
    setLogoPreview(null);
    setClearLogo(false);

    setFaviconFile(null);
    setFaviconPreview(null);
    setClearFavicon(false);
  }

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setClearLogo(false);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleClearLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setClearLogo(true);
  };

  const handleFaviconChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaviconFile(file);
    setClearFavicon(false);
    setFaviconPreview(URL.createObjectURL(file));
  };

  const handleClearFavicon = () => {
    setFaviconFile(null);
    setFaviconPreview(null);
    setClearFavicon(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("store_name", storeName.trim());
      formData.append("tagline", tagline.trim());
      formData.append("whatsapp_number", whatsappNumber.trim());
      formData.append("whatsapp_message", whatsappMessage.trim());
      formData.append("contact_phone", contactPhone.trim());
      formData.append(
        "support_phones",
        JSON.stringify(
          supportPhones
            .map((p) => ({ label: p.label.trim(), number: p.number.trim() }))
            .filter((p) => p.label && p.number),
        ),
      );
      formData.append("contact_email", contactEmail.trim());
      formData.append("address", address.trim());
      formData.append("instagram_url", instagramUrl.trim());
      formData.append("facebook_url", facebookUrl.trim());
      formData.append("tiktok_url", tiktokUrl.trim());
      formData.append("twitter_url", twitterUrl.trim());
      formData.append("youtube_url", youtubeUrl.trim());
      formData.append("announcement_text", announcementText.trim());
      formData.append("is_announcement_active", String(isAnnouncementActive));
      formData.append("mpesa_shortcode", mpesaShortcode.trim());

      if (logoFile) {
        formData.append("logo", logoFile);
      } else if (clearLogo) {
        formData.append("clear_logo", "true");
      }

      if (faviconFile) {
        formData.append("favicon", faviconFile);
      } else if (clearFavicon) {
        formData.append("clear_favicon", "true");
      }

      await api.patchForm<StoreSettings>("/api/v1/admin/settings/", formData);
      toast.success("Store settings updated successfully.");
      refetch();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update store settings.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const currentLogoSrc = clearLogo
    ? "/wayaz_logo.jpeg"
    : logoPreview || data?.logo_url || "/wayaz_logo.jpeg";

  const hasCustomLogo =
    !clearLogo && (Boolean(logoPreview) || Boolean(data?.logo_url));

  const currentFaviconSrc = clearFavicon
    ? "/wayaz_favicon.jpeg"
    : faviconPreview || data?.favicon_url || "/wayaz_favicon.jpeg";

  const hasCustomFavicon =
    !clearFavicon && (Boolean(faviconPreview) || Boolean(data?.favicon_url));

  const cleanWhatsapp = whatsappNumber.replace(/[^0-9]/g, "");
  const whatsappTestUrl = `https://wa.me/${cleanWhatsapp || "254700000000"}?text=${encodeURIComponent(
    whatsappMessage || "Hi Wayaz, I'd like to make an inquiry.",
  )}`;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Store & Business Settings"
        description="Manage your storefront branding, custom logo, WhatsApp communication channel, socials, and site announcements."
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data && (
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      )}

      {data && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center gap-2">
                <Store className="size-4 text-gold" />
                <CardTitle className="text-base font-bold">
                  Store Identity & Branding
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Your store name, tagline, and brand assets displayed across the
                storefront header, footer, and sidebar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="store_name" className="text-xs font-semibold">
                    Store Name
                  </Label>
                  <Input
                    id="store_name"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Wayaz Collection"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Shown in page titles, header alt tags, and copyright
                    notices.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tagline" className="text-xs font-semibold">
                    Tagline / Subheading
                  </Label>
                  <Input
                    id="tagline"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="Fresh pieces delivered across Kenya"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Featured in the storefront footer and social share
                    descriptions.
                  </p>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 pt-2 border-t border-border/50">
                <div className="space-y-3">
                  <Label className="text-xs font-semibold block">
                    Store Logo
                  </Label>
                  <div className="flex items-start gap-4">
                    <div className="relative size-20 rounded-xl border border-border/70 bg-muted/40 p-2 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentLogoSrc}
                        alt="Logo preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="space-y-2 flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Upload your brand logo (PNG, JPG, or SVG). Replaces the
                        default public folder logo across the store.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Label
                          htmlFor="logo-upload"
                          className="inline-flex items-center gap-1.5 text-xs font-medium border border-border/70 rounded-md px-2.5 py-1.5 bg-background hover:bg-muted cursor-pointer transition-colors"
                        >
                          <Upload className="size-3.5" />
                          Choose New Logo
                        </Label>
                        <input
                          id="logo-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleLogoChange}
                          className="sr-only"
                        />
                        {hasCustomLogo && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleClearLogo}
                            className="h-7 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                          >
                            <RotateCcw className="size-3 mr-1" />
                            Revert to Default
                          </Button>
                        )}
                      </div>
                      {logoFile && (
                        <p className="text-[11px] text-emerald-600 font-medium">
                          Selected: {logoFile.name}
                        </p>
                      )}
                      {clearLogo && (
                        <p className="text-[11px] text-amber-600 font-medium">
                          Logo will revert to default image upon saving.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-semibold block">
                    Store Favicon / Icon
                  </Label>
                  <div className="flex items-start gap-4">
                    <div className="relative size-12 rounded-lg border border-border/70 bg-muted/40 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentFaviconSrc}
                        alt="Favicon preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="space-y-2 flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Browser tab icon (ICO, PNG, or JPG).
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Label
                          htmlFor="favicon-upload"
                          className="inline-flex items-center gap-1.5 text-xs font-medium border border-border/70 rounded-md px-2.5 py-1.5 bg-background hover:bg-muted cursor-pointer transition-colors"
                        >
                          <Upload className="size-3.5" />
                          Upload Favicon
                        </Label>
                        <input
                          id="favicon-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleFaviconChange}
                          className="sr-only"
                        />
                        {hasCustomFavicon && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleClearFavicon}
                            className="h-7 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                          >
                            <RotateCcw className="size-3 mr-1" />
                            Revert
                          </Button>
                        )}
                      </div>
                      {faviconFile && (
                        <p className="text-[11px] text-emerald-600 font-medium">
                          Selected: {faviconFile.name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center gap-2">
                <WhatsAppIcon className="size-4 text-emerald-600" />
                <CardTitle className="text-base font-bold">
                  WhatsApp & Contact Channels
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Configure your official WhatsApp line and contact channels used
                across &quot;Order on WhatsApp&quot;, cart checkout, and
                customer support.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="whatsapp_number"
                    className="text-xs font-semibold"
                  >
                    Primary WhatsApp Business Number
                  </Label>
                  <div className="relative">
                    <Input
                      id="whatsapp_number"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="254700000000"
                      required
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                    <span>
                      Include country code without plus (e.g. 254712345678)
                    </span>
                    <a
                      href={whatsappTestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                    >
                      Test Link
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="whatsapp_message"
                    className="text-xs font-semibold"
                  >
                    Default WhatsApp Greeting Message
                  </Label>
                  <Input
                    id="whatsapp_message"
                    value={whatsappMessage}
                    onChange={(e) => setWhatsappMessage(e.target.value)}
                    placeholder="Hi Wayaz, I'd like to make an inquiry."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Pre-filled text when shoppers tap the WhatsApp button in the
                    footer or support links.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-border/50">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="contact_phone"
                    className="text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Phone className="size-3 text-muted-foreground" />
                    Support Phone
                  </Label>
                  <Input
                    id="contact_phone"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+254 700 000 000"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="contact_email"
                    className="text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Mail className="size-3 text-muted-foreground" />
                    Support Email
                  </Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="info@wayaz.co.ke"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="address"
                    className="text-xs font-semibold flex items-center gap-1.5"
                  >
                    <MapPin className="size-3 text-muted-foreground" />
                    Physical Location / Town
                  </Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Nairobi, Kenya"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Phone className="size-3 text-muted-foreground" />
                      Department Support Phone Numbers (Up to 6)
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Add direct lines for Sales, Delivery, Inquiries, etc.
                      Displayed on the footer and contact page.
                    </p>
                  </div>
                  {supportPhones.length < 6 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSupportPhones([
                          ...supportPhones,
                          { label: "", number: "" },
                        ])
                      }
                      className="h-7 text-xs gap-1 cursor-pointer"
                    >
                      <Plus className="size-3" />
                      Add Phone
                    </Button>
                  )}
                </div>

                {supportPhones.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70 italic py-1">
                    No department phones configured. Only the primary support
                    line will be displayed.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {supportPhones.map((phone, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          placeholder="Department (e.g. Sales, Deliveries)"
                          value={phone.label}
                          onChange={(e) => {
                            const next = [...supportPhones];
                            next[idx] = { ...next[idx], label: e.target.value };
                            setSupportPhones(next);
                          }}
                          className="w-1/3 text-xs"
                          maxLength={40}
                        />
                        <Input
                          placeholder="Phone (e.g. +254 712 345 678)"
                          value={phone.number}
                          onChange={(e) => {
                            const next = [...supportPhones];
                            next[idx] = {
                              ...next[idx],
                              number: e.target.value,
                            };
                            setSupportPhones(next);
                          }}
                          className="flex-1 text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSupportPhones(
                              supportPhones.filter((_, i) => i !== idx),
                            );
                          }}
                          className="size-8 text-destructive hover:bg-destructive/10 cursor-pointer shrink-0"
                          title="Remove phone"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center gap-2">
                <Share2 className="size-4 text-primary" />
                <CardTitle className="text-base font-bold">
                  Social Media Profiles
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Links rendered in the storefront footer. Leave any empty if you
                do not have an active profile for that network.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="instagram_url"
                    className="text-xs font-semibold flex items-center gap-1.5"
                  >
                    <InstagramIcon className="size-3.5 text-pink-600" />
                    Instagram Profile URL
                  </Label>
                  <Input
                    id="instagram_url"
                    type="url"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    placeholder="https://www.instagram.com/wayaz"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="facebook_url"
                    className="text-xs font-semibold flex items-center gap-1.5"
                  >
                    <FacebookIcon className="size-3.5 text-blue-600" />
                    Facebook Page URL
                  </Label>
                  <Input
                    id="facebook_url"
                    type="url"
                    value={facebookUrl}
                    onChange={(e) => setFacebookUrl(e.target.value)}
                    placeholder="https://www.facebook.com/wayaz"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="tiktok_url"
                    className="text-xs font-semibold flex items-center gap-1.5"
                  >
                    <TikTokIcon className="size-3.5" />
                    TikTok Profile URL
                  </Label>
                  <Input
                    id="tiktok_url"
                    type="url"
                    value={tiktokUrl}
                    onChange={(e) => setTiktokUrl(e.target.value)}
                    placeholder="https://www.tiktok.com/@wayaz"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="twitter_url"
                    className="text-xs font-semibold flex items-center gap-1.5"
                  >
                    <TwitterIcon className="size-3.5" />X (Twitter) Profile URL
                  </Label>
                  <Input
                    id="twitter_url"
                    type="url"
                    value={twitterUrl}
                    onChange={(e) => setTwitterUrl(e.target.value)}
                    placeholder="https://x.com/wayaz"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label
                    htmlFor="youtube_url"
                    className="text-xs font-semibold flex items-center gap-1.5"
                  >
                    <YouTubeIcon className="size-3.5 text-red-600" />
                    YouTube Channel URL (Optional)
                  </Label>
                  <Input
                    id="youtube_url"
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/@wayaz"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center gap-2">
                <Megaphone className="size-4 text-gold" />
                <CardTitle className="text-base font-bold">
                  Storefront Announcement Banner
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Highlight promotions, delivery promos, or holiday notices across
                the top of the storefront header.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="flex items-center gap-3">
                <input
                  id="is_announcement_active"
                  type="checkbox"
                  checked={isAnnouncementActive}
                  onChange={(e) => setIsAnnouncementActive(e.target.checked)}
                  className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                />
                <Label
                  htmlFor="is_announcement_active"
                  className="text-xs font-semibold cursor-pointer"
                >
                  Enable Announcement Banner on Store Header
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="announcement_text"
                  className="text-xs font-semibold"
                >
                  Banner Text
                </Label>
                <Input
                  id="announcement_text"
                  value={announcementText}
                  onChange={(e) => setAnnouncementText(e.target.value)}
                  placeholder="🔥 Free delivery in Nairobi on all orders above Ksh 5,000 this week!"
                />
              </div>

              {isAnnouncementActive && announcementText && (
                <div className="rounded-lg border border-border/70 p-3 bg-muted/40 space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Storefront Live Preview
                  </p>
                  <div className="rounded bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground shadow-xs">
                    {announcementText}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Smartphone className="size-5 text-emerald-600" />
                M-Pesa Payments
              </CardTitle>
              <CardDescription>
                Configure your M-Pesa business Till number used when customers
                pay via STK Push at checkout.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-w-xs">
                <Label htmlFor="mpesaShortcode">
                  Till Number / Paybill Shortcode
                </Label>
                <Input
                  id="mpesaShortcode"
                  value={mpesaShortcode}
                  onChange={(e) => setMpesaShortcode(e.target.value)}
                  placeholder="e.g. 522533"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Overrides the server default. Leave blank to use the value in
                  your <code className="font-semibold">.env</code> file.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-4 z-20 flex items-center justify-between rounded-xl border border-border/80 bg-background/95 p-4 shadow-lg backdrop-blur">
            <p className="text-xs text-muted-foreground">
              Changes apply instantly across both the admin dashboard and public
              storefront.
            </p>
            <Button
              type="submit"
              disabled={saving}
              className="gap-2 cursor-pointer font-semibold shadow-xs"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving Settings…
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Save Business Settings
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
