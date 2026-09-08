import { Sequelize } from "sequelize";
import { SupportTicket } from "../models/support_ticket_model";
import { SupportTicketMessage } from "../models/support_ticket_message_model";

export async function ensureSupportTicketsTables(sequelize: Sequelize): Promise<void> {
  try {
    const [ticketRows] = (await sequelize.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'SupportTickets'
      ) AS "exists";
    `)) as [Array<{ exists: boolean }>, unknown];

    if (!ticketRows?.[0]?.exists) {
      await SupportTicket.sync();
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "support_tickets_status" ON "SupportTickets" ("status");
        CREATE INDEX IF NOT EXISTS "support_tickets_category" ON "SupportTickets" ("category");
        CREATE INDEX IF NOT EXISTS "support_tickets_priority" ON "SupportTickets" ("priority");
        CREATE INDEX IF NOT EXISTS "support_tickets_user_id" ON "SupportTickets" ("userId");
        CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_ticket_number"
          ON "SupportTickets" ("ticketNumber");
      `);
      console.log("✅ SupportTickets table ensured");
    }

    const [messageRows] = (await sequelize.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'SupportTicketMessages'
      ) AS "exists";
    `)) as [Array<{ exists: boolean }>, unknown];

    if (!messageRows?.[0]?.exists) {
      await SupportTicketMessage.sync();
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "support_ticket_messages_ticket_id"
          ON "SupportTicketMessages" ("ticketId");
      `);
      console.log("✅ SupportTicketMessages table ensured");
    }
  } catch (error) {
    console.warn("Could not ensure SupportTickets tables:", error);
  }
}
