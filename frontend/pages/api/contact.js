import { Resend } from "resend";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Brak konfiguracji wysyłki." });
  }

  const { name, email, subject, message } = req.body || {};
  const trimmedEmail = String(email || "").trim();
  const trimmedMessage = String(message || "").trim();
  const trimmedName = String(name || "").trim();
  const trimmedSubject = String(subject || "").trim();

  if (!trimmedEmail || !trimmedMessage) {
    return res.status(400).json({ error: "Podaj adres e-mail i treść wiadomości." });
  }

  const resend = new Resend(apiKey);
  const mailSubject = `[Formularz Drukstacja] ${trimmedSubject || "Nowe zapytanie"} - ${trimmedName || trimmedEmail}`;

  try {
    const { error } = await resend.emails.send({
      from: "Drukstacja Formularz <kontakt@drukstacja.pl>",
      to: "kontakt@drukstacja.pl",
      replyTo: trimmedEmail,
      subject: mailSubject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
          <h2 style="margin:0 0 16px">Nowe zapytanie z formularza</h2>
          <p style="margin:0 0 8px"><strong>Imię / firma:</strong> ${escapeHtml(trimmedName) || "—"}</p>
          <p style="margin:0 0 8px"><strong>E-mail:</strong> ${escapeHtml(trimmedEmail)}</p>
          <p style="margin:0 0 16px"><strong>Temat:</strong> ${escapeHtml(trimmedSubject) || "—"}</p>
          <div style="padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;white-space:pre-wrap">${escapeHtml(trimmedMessage)}</div>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(502).json({ error: "Nie udało się wysłać wiadomości." });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Contact API error:", err);
    return res.status(500).json({ error: "Nie udało się wysłać wiadomości." });
  }
}
