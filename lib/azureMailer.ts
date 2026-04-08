import { EmailClient } from "@azure/communication-email";

const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
const sender = process.env.AZURE_COMMUNICATION_SENDER;

if (!connectionString) console.warn("AZURE_COMMUNICATION_CONNECTION_STRING is not set.");
if (!sender) console.warn("AZURE_COMMUNICATION_SENDER is not set.");

export async function sendEmail(to: string, subject: string, htmlBody: string) {
  if (!connectionString || !sender) throw new Error("ACS email config missing.");
  const client = new EmailClient(connectionString);
  const message = {
    senderAddress: sender,
    content: { subject, html: htmlBody },
    recipients: { to: [{ address: to }] },
  };
  const poller = await client.beginSend(message);
  await poller.pollUntilDone();
}
