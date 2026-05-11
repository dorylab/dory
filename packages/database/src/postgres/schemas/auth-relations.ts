import { relations } from 'drizzle-orm';
import { account, invitation, session, user } from './auth-schema';
import { organizationMembers } from './organizations/organization-members';
import { organizations } from './organizations/organizations';

export const userRelations = relations(user, ({ many }) => ({
    accounts: many(account),
    sessions: many(session),
    members: many(organizationMembers),
    ownedOrganizations: many(organizations),
    invitationsSent: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
    user: one(user, {
        fields: [session.userId],
        references: [user.id],
    }),
    activeOrganization: one(organizations, {
        fields: [session.activeOrganizationId],
        references: [organizations.id],
    }),
}));

export const accountRelations = relations(account, ({ one }) => ({
    user: one(user, {
        fields: [account.userId],
        references: [user.id],
    }),
}));

export const organizationRelations = relations(organizations, ({ one, many }) => ({
    owner: one(user, {
        fields: [organizations.ownerUserId],
        references: [user.id],
    }),
    members: many(organizationMembers),
    invitations: many(invitation),
}));

export const organizationMemberRelations = relations(organizationMembers, ({ one }) => ({
    user: one(user, {
        fields: [organizationMembers.userId],
        references: [user.id],
    }),
    organization: one(organizations, {
        fields: [organizationMembers.organizationId],
        references: [organizations.id],
    }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
    organization: one(organizations, {
        fields: [invitation.organizationId],
        references: [organizations.id],
    }),
    inviter: one(user, {
        fields: [invitation.inviterId],
        references: [user.id],
    }),
}));
