-- Add DEVELOPER role for membership permissions
ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'DEVELOPER';
