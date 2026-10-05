import { TeamMemberPermission } from "../models/team_member_permission_model";
import { User } from "../models/user_model";

export type TeamBookingScope = "all" | "limited" | "none";
export type TeamEarningsScope = "all" | "limited" | "none";

export async function getTeamMemberPermissionsForUser(
  user: User
): Promise<TeamMemberPermission | null> {
  if (!user.isTeamMember) return null;
  return TeamMemberPermission.findOne({
    where: { teamMemberId: user.id },
  });
}

function hasAnySplitPermissionFlags(
  permissions: TeamMemberPermission
): boolean {
  return (
    Boolean(permissions.viewTotalBookings) ||
    Boolean(permissions.viewLimitedBookings) ||
    Boolean(permissions.viewTotalEarnings) ||
    Boolean(permissions.viewLimitedEarnings)
  );
}

export function getBookingScope(
  permissions: TeamMemberPermission | null | undefined
): TeamBookingScope {
  if (!permissions) return "none";
  if (permissions.viewTotalBookings) return "all";
  if (permissions.viewLimitedBookings) return "limited";
  // Pre-migration clients only had the unified flag (full suite-wide access).
  if (!hasAnySplitPermissionFlags(permissions) && permissions.viewBookings) {
    return "all";
  }
  return "none";
}

export function getEarningsScope(
  permissions: TeamMemberPermission | null | undefined
): TeamEarningsScope {
  if (!permissions) return "none";
  if (permissions.viewTotalEarnings) return "all";
  if (permissions.viewLimitedEarnings) return "limited";
  // Pre-migration clients only had the unified flag (full suite-wide access).
  // Do not treat the synced viewBookings bookings flag as earnings access.
  if (!hasAnySplitPermissionFlags(permissions) && permissions.viewBookings) {
    return "all";
  }
  return "none";
}
