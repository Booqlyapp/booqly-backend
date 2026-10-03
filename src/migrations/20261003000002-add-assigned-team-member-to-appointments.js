"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Appointments", "assignedTeamMemberId", {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addColumn("ExternalAppointments", "assignedTeamMemberId", {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("Appointments", ["assignedTeamMemberId"], {
      name: "appointments_assigned_team_member_id_idx",
    });
    await queryInterface.addIndex("ExternalAppointments", ["assignedTeamMemberId"], {
      name: "external_appointments_assigned_team_member_id_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "ExternalAppointments",
      "external_appointments_assigned_team_member_id_idx"
    );
    await queryInterface.removeIndex(
      "Appointments",
      "appointments_assigned_team_member_id_idx"
    );
    await queryInterface.removeColumn("ExternalAppointments", "assignedTeamMemberId");
    await queryInterface.removeColumn("Appointments", "assignedTeamMemberId");
  },
};
