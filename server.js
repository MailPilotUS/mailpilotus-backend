/**
 * MailPilotUS — Stripe Checkout backend
 * ------------------------------------
 * This is the piece that actually talks to Stripe's API. It has to run on
 * a server you control — never in the browser — because it uses your
 * SECRET key, which must never be exposed to anyone visiting the site.
 *
 * Setup:
 *   1. npm install express stripe dotenv
 *   2. Create a .env file (do NOT commit it) with:
 *        STRIPE_SECRET_KEY=sk_live_...          (or sk_test_... while testing)
 *        STRIPE_WEBHOOK_SECRET=whsec_...        (from the Stripe dashboard, step 5 below)
 *        DOMAIN=https://yourdomain.com
 *   3. In the Stripe dashboard, create a Product ("MailPilotUS Pro") with a
 *      recurring Price ($9/month). Copy its price ID (price_...) and paste
 *      it into mailpilotus-pricing.html where it currently says
 *      "price_REPLACE_WITH_PRO_PRICE_ID".
 *   4. Run: node server.js
 *   5. In the Stripe dashboard, add a webhook endpoint pointing at
 *      https://yourdomain.com/api/stripe-webhook, listening for
 *      checkout.session.completed and customer.subscription.deleted.
 *      Stripe will give you the signing secret for STRIPE_WEBHOOK_SECRET.
 *
 * What you still need to build yourself:
 *   - A real database to store which customer/email owns which
 *     MailPilotUS address and whether their subscription is active.
 *   - The logic in the webhook handler below that actually provisions
 *     the mailbox once payment succeeds (marked with a TODO).
 */

require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const DOMAIN = process.env.DOMAIN || 'http://localhost:3000';

// Stripe's webhook route needs the raw body, so it's registered
// before the global JSON body-parser below.
app.post(
  '/api/stripe-webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // TODO: look up session.customer_email, mark them as a paid
        // subscriber in your database, and provision their MailPilotUS
        // mailbox address if they don't already have one.
        console.log('Payment succeeded for', session.customer_email);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        // TODO: mark the matching customer as unsubscribed and pause
        // (don't necessarily delete) their MailPilotUS address.
        console.log('Subscription canceled:', subscription.id);
        break;
      }
    }

    res.json({ received: true });
  }
);

app.use(express.json());
app.use(express.static('public')); // serve mailpilotus-pricing.html from here

// Creates a Stripe-hosted Checkout page for the selected plan.
app.post('/api/create-checkout-session', async (req, res) => {
  const { priceId, customerEmail } = req.body;

  if (!priceId) {
    return res.status(400).json({ error: 'Missing priceId' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: customerEmail,
      success_url: `${DOMAIN}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${DOMAIN}/pricing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe session creation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MailPilotUS billing server running on port ${PORT}`));
