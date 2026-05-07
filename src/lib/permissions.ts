

import type { User } from './types';

// Define all possible permissions in the application
export const ALL_PERMISSIONS = [
    // Dashboard
    'CAN_VIEW_DASHBOARD',
    
    // Notifications
    'CAN_VIEW_NOTIFICATIONS',

    // Entities
    'CAN_MANAGE_AGENCIES',
    'CAN_MANAGE_PROVIDERS',
    'CAN_MANAGE_GUIDES',
    'CAN_MANAGE_VEHICLES',
    'CAN_MANAGE_DESCRIPTIONS',
    'CAN_MANAGE_SERVICES',
    'CAN_VIEW_DESCRIPTIONS',

    // Resources Menu (to show the parent menu)
    'CAN_VIEW_RESOURCES_MENU',

    // Payments
    'CAN_VIEW_PAYMENTS_MENU',
    'CAN_MANAGE_SETTLEMENTS',
    'CAN_MANAGE_PAYMENT_ACCOUNTS',
    'CAN_VIEW_ARCHIVE',
    'CAN_CONFIRM_PAYMENTS', // Mark as paid

    // Reports
    'CAN_CREATE_REPORTS',
    'CAN_VIEW_REPORTS',

    // Review
    'CAN_REVIEW_BOOKINGS',

    // Users
    'CAN_MANAGE_USERS',

    // Settings
    'CAN_VIEW_SETTINGS_MENU',
    'CAN_MANAGE_APP_SETTINGS',
    'CAN_EDIT_OWN_PROFILE',

    // Daily Ops
    'CAN_MANAGE_DAILY_OPERATIONS',

] as const;

export type Permission = typeof ALL_PERMISSIONS[number];

// Assign permissions to roles
const ROLE_PERMISSIONS: Record<User['role'], Permission[]> = {
    'super-admin': [
        ...ALL_PERMISSIONS // Super admin can do everything
    ],
    'admin': [
        'CAN_VIEW_DASHBOARD',
        'CAN_VIEW_NOTIFICATIONS',
        'CAN_MANAGE_AGENCIES',
        'CAN_MANAGE_PROVIDERS',
        'CAN_VIEW_RESOURCES_MENU',
        'CAN_MANAGE_GUIDES',
        'CAN_MANAGE_VEHICLES',
        'CAN_MANAGE_DESCRIPTIONS',
        'CAN_MANAGE_SERVICES',
        'CAN_VIEW_PAYMENTS_MENU',
        'CAN_MANAGE_SETTLEMENTS',
        'CAN_MANAGE_PAYMENT_ACCOUNTS',
        'CAN_VIEW_ARCHIVE',
        'CAN_CONFIRM_PAYMENTS',
        'CAN_VIEW_REPORTS',
        'CAN_CREATE_REPORTS',
        'CAN_REVIEW_BOOKINGS',
        'CAN_MANAGE_DAILY_OPERATIONS',
        'CAN_VIEW_SETTINGS_MENU',
        'CAN_EDIT_OWN_PROFILE',
        'CAN_VIEW_DESCRIPTIONS',
    ],
    'agent': [
        'CAN_VIEW_DASHBOARD',
        'CAN_VIEW_NOTIFICATIONS',
        'CAN_VIEW_PAYMENTS_MENU',
        'CAN_MANAGE_SETTLEMENTS', // To see their own settlements and inform payment
        'CAN_EDIT_OWN_PROFILE',
        'CAN_VIEW_SETTINGS_MENU',
        'CAN_CREATE_REPORTS',
        'CAN_VIEW_DESCRIPTIONS',
        'CAN_REVIEW_BOOKINGS', // To see and respond to quotes
    ],
    'vendedor': [
        'CAN_VIEW_DASHBOARD',
        'CAN_VIEW_NOTIFICATIONS',
        'CAN_EDIT_OWN_PROFILE',
        'CAN_VIEW_SETTINGS_MENU',
        'CAN_VIEW_DESCRIPTIONS',
        'CAN_REVIEW_BOOKINGS', // To see and respond to quotes
    ],
    'guia': [
        'CAN_VIEW_DASHBOARD', // To see their daily assignments
        'CAN_VIEW_RESOURCES_MENU',
        'CAN_MANAGE_GUIDES', // To edit their own profile
        'CAN_VIEW_NOTIFICATIONS',
        'CAN_EDIT_OWN_PROFILE',
        'CAN_VIEW_SETTINGS_MENU',
        'CAN_VIEW_DESCRIPTIONS',
    ],
    'hotel': [
        'CAN_VIEW_DASHBOARD',
        'CAN_VIEW_NOTIFICATIONS',
        'CAN_EDIT_OWN_PROFILE',
        'CAN_VIEW_SETTINGS_MENU',
        'CAN_VIEW_DESCRIPTIONS',
        'CAN_CREATE_REPORTS', // To create quotes
    ],
};

/**
 * Checks if a user has a specific permission.
 * @param user The user object.
 * @param permission The permission to check.
 * @returns True if the user has the permission, false otherwise.
 */
export function hasPermission(user: User | null, permission: Permission): boolean {
    if (!user) {
        return false;
    }
    return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}
