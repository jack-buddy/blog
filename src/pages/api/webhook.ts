import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false; // This is a server endpoint

export const POST: APIRoute = async ({ request }) => {
  try {
    // Get environment variables
    const RESEND_API_KEY = import.meta.env.RESEND_API_KEY;
    const RESEND_WEBHOOK_SECRET = import.meta.env.RESEND_WEBHOOK_SECRET;

    if (!RESEND_API_KEY || !RESEND_WEBHOOK_SECRET) {
      console.error('[Webhook] Missing environment variables');
      return new Response('Configuration error', { status: 500 });
    }

    const resend = new Resend(RESEND_API_KEY);

    // Get raw body for signature verification
    const payload = await request.text();

    // Get headers for verification
    const id = request.headers.get('svix-id');
    const timestamp = request.headers.get('svix-timestamp');
    const signature = request.headers.get('svix-signature');

    if (!id || !timestamp || !signature) {
      console.error('[Webhook] Missing required headers');
      return new Response('Missing headers', { status: 400 });
    }

    // Verify webhook signature using Resend SDK
    const event = resend.webhooks.verify({
      payload,
      headers: {
        id,
        timestamp,
        signature,
      },
      webhookSecret: RESEND_WEBHOOK_SECRET,
    });

    console.log('[Webhook] Signature verified, event type:', event.type);

    if (event.type === 'email.received') {
      const { from, to, subject, email_id } = event.data;

      // SECURITY: Only accept emails from allowlist
      const ALLOWED_SENDERS = [
        'chris@resend.com',
        'christina@resend.com',
        'woz@claw.waybackstore.com'
      ];

      if (!ALLOWED_SENDERS.includes(from)) {
        console.log(`[Security] BLOCKED email from unauthorized sender: ${from}`);
        return new Response('Unauthorized sender', { status: 500 });
      }

      console.log(`[Email] From: ${from}, To: ${to}, Subject: ${subject}`);

      // Get full email content
      const { data: email } = await resend.emails.receiving.get(email_id);

      // Auto-reply logic
      try {
        const emailContent = (email.text || email.html || '').toLowerCase();
        const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

        // Always reply to Chris if it's a question or request
        if (from === 'chris@resend.com') {
          await resend.emails.send({
            from: 'Jack <me@jack.codinginpublic.dev>',
            to: [from],
            subject: replySubject,
            html: `<p>Got it! Working on this now...</p>
<p>You wrote:</p>
<blockquote style="border-left: 3px solid #ccc; padding-left: 12px; margin: 12px 0; color: #666;">
${email.html || email.text || '(empty)'}
</blockquote>
<p>I'll follow up shortly.</p>
<p>- Jack 🤖</p>`,
          });
          console.log('[Auto-reply] Sent immediate reply to Chris');
        }
        // Reply to Christina/Woz if it seems appropriate (questions, requests, greetings)
        else if (from === 'christina@resend.com' || from === 'woz@claw.waybackstore.com') {
          const shouldReply =
            emailContent.includes('?') ||
            emailContent.includes('can you') ||
            emailContent.includes('could you') ||
            emailContent.includes('would you') ||
            emailContent.includes('please') ||
            emailContent.includes('hello') ||
            emailContent.includes('hi jack') ||
            emailContent.includes('hey jack');

          if (shouldReply) {
            await resend.emails.send({
              from: 'Jack <me@jack.codinginpublic.dev>',
              to: [from],
              subject: replySubject,
              html: `<p>Thanks for your email! Let me get back to you on this.</p>
<p>- Jack 🤖</p>`,
            });
            console.log(`[Auto-reply] Sent reply to ${from}`);
          } else {
            console.log(`[Auto-reply] Skipping auto-reply to ${from} (doesn't seem to need immediate response)`);
          }
        }
      } catch (error) {
        console.error('[Auto-reply] Error:', error);
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return new Response('Error processing webhook', { status: 400 });
  }
};
