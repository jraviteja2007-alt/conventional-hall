// Starter legal copy. IMPORTANT: have a qualified lawyer review and adapt these before going live.
export const LEGAL_KEYS = ['privacy_policy', 'terms', 'cancellation_policy', 'refund_policy', 'cookie_policy'];

export const LEGAL_DEFAULTS = {
  privacy_policy: {
    title: 'Privacy Policy',
    body: `We collect only the information needed to handle your enquiry or booking: your name, mobile number, email, event details and payment references. Card and UPI details are processed by our payment gateway and are never stored on our servers.

How we use your information
- To check availability, prepare quotations, confirm bookings and send receipts and reminders.
- To contact you about your event by phone, email, SMS or WhatsApp.
- To improve our services using anonymous usage statistics.

Sharing
We do not sell your personal data. We share it only with service providers that help us run the business (payment gateway, email/SMS provider, hosting) and when required by law.

Your choices
You can ask us to access, correct or delete your personal data by contacting us. Booking and payment records may be retained as required by tax and accounting rules.

Security
Passwords are stored using strong one-way hashing, connections are encrypted, and access to staff tools is role-restricted.`,
  },
  terms: {
    title: 'Terms & Conditions',
    body: `1. Booking. A date is reserved only after the advance payment is received and the booking is confirmed by us. Quotations and availability enquiries do not hold a date.
2. Payments. The advance is shown during booking. The balance must be paid before the event date as shown in your booking summary. All prices are in Indian Rupees; applicable GST is added.
3. Timings. Your booking covers the hours you selected, including setup and clearing unless stated otherwise. Extra hours are charged at the published rate.
4. Capacity & safety. Guest numbers must not exceed the hall capacity. We may refuse entry or stop an event that breaches safety rules.
5. Decoration, catering & vendors. Outside vendors must follow venue rules and may be asked for identification. Open flames, fireworks and anything that damages the property are not permitted.
6. Damage. The customer is responsible for damage to the venue or equipment caused by guests or vendors.
7. Licences. Music, DJ and event licences, where required, are the customer's responsibility unless stated in the package.
8. Changes. Modifications and rescheduling are subject to availability and the deadlines shown in your booking.
9. Cancellations & refunds. See the Cancellation Policy and Refund Policy.
10. Force majeure. Neither party is liable for failure caused by events beyond reasonable control; we will offer a reschedule where possible.
11. Governing law. These terms are governed by the laws of India. Courts at Guntur, Andhra Pradesh have jurisdiction.`,
  },
  cancellation_policy: {
    title: 'Cancellation Policy',
    body: `You may cancel a booking from your account or by contacting us. The refund depends on how many days remain before your event date (the table below is generated from our current settings).

Rescheduling is allowed once, subject to availability, up to the number of days shown before the event. Rescheduling to a peak-season or weekend date may change the price.

If we have to cancel because of maintenance or an emergency, you will get a full refund or a free reschedule.`,
  },
  refund_policy: {
    title: 'Refund Policy',
    body: `Approved refunds are returned to the original payment method. Processing normally takes 5-10 working days after approval, depending on your bank.

- Refund amounts follow the Cancellation Policy and apply to the amount actually paid.
- Payment gateway charges, where applicable, are non-refundable.
- Rejected booking requests and expired holds are refunded in full.
- If a payment is debited but the booking could not be confirmed, we refund the full amount.`,
  },
  cookie_policy: {
    title: 'Cookie Policy',
    body: `We use a small number of cookies:
- Essential: keep you signed in and protect forms from forgery (CSRF). These cannot be switched off.
- Preferences: remember choices such as your last selected hall.
- Analytics (optional): if enabled by the venue, anonymous traffic statistics via Google Analytics or Meta Pixel. These load only after you accept cookies.

You can clear cookies in your browser settings at any time; some features may stop working.`,
  },
};
