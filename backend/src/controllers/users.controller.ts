/**
 * Users Controller
 * Handles user profile management and statistics
 */

import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { Document } from '../models/document.model';
import { Signature } from '../models/signature.model';
import { Op } from 'sequelize';

export class UsersController {
  /**
   * Get user profile
   * GET /api/users/profile
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      const user = await User.findByPk(req.userId);

      if (!user) {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      res.status(200).json({
        user: user.toSafeJSON(),
      });
    } catch (error: any) {
      console.error('Get profile error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get user profile',
      });
    }
  }

  /**
   * Update user profile
   * PUT /api/users/profile
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      const { first_name, last_name } = req.body;

      const user = await User.findByPk(req.userId);

      if (!user) {
        res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
        return;
      }

      // Update allowed fields
      const updateData: any = {};
      if (first_name !== undefined) updateData.first_name = first_name;
      if (last_name !== undefined) updateData.last_name = last_name;

      await user.update(updateData);

      console.log(`✅ Profile updated for user: ${user.email}`);

      res.status(200).json({
        message: 'Profile updated successfully',
        user: user.toSafeJSON(),
      });
    } catch (error: any) {
      console.error('Update profile error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update profile',
      });
    }
  }

  /**
   * Get user statistics
   * GET /api/users/stats
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      // Get document counts
      const totalDocuments = await Document.count({
        where: { user_id: req.userId },
      });

      const signedDocuments = await Document.count({
        where: { user_id: req.userId, status: 'signed' },
      });

      const pendingDocuments = await Document.count({
        where: { user_id: req.userId, status: 'uploaded' },
      });

      // Get signature counts
      const totalSignatures = await Signature.count({
        include: [
          {
            model: Document,
            as: 'document',
            where: { user_id: req.userId },
          },
        ],
      });

      // Get algorithm usage
      const algorithmUsage = await Signature.findAll({
        attributes: ['algorithm'],
        include: [
          {
            model: Document,
            as: 'document',
            where: { user_id: req.userId },
            attributes: [],
          },
        ],
        group: ['algorithm'],
        raw: true,
      });

      // Get recent activity (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentDocuments = await Document.count({
        where: {
          user_id: req.userId,
          created_at: { [Op.gte]: thirtyDaysAgo },
        },
      });

      const recentSignatures = await Signature.count({
        where: {
          created_at: { [Op.gte]: thirtyDaysAgo },
        },
        include: [
          {
            model: Document,
            as: 'document',
            where: { user_id: req.userId },
          },
        ],
      });

      // Get storage usage (sum of file sizes)
      const storageUsage = await Document.sum('file_size', {
        where: { user_id: req.userId },
      });

      res.status(200).json({
        stats: {
          documents: {
            total: totalDocuments,
            signed: signedDocuments,
            pending: pendingDocuments,
          },
          signatures: {
            total: totalSignatures,
          },
          activity: {
            documents_last_30_days: recentDocuments,
            signatures_last_30_days: recentSignatures,
          },
          storage: {
            used_bytes: storageUsage || 0,
            used_mb: ((storageUsage || 0) / (1024 * 1024)).toFixed(2),
          },
          algorithms: algorithmUsage,
        },
      });
    } catch (error: any) {
      console.error('Get stats error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get statistics',
      });
    }
  }

  /**
   * Get user activity history
   * GET /api/users/activity
   */
  async getActivity(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      const { limit = 20, offset = 0 } = req.query;

      // Get recent documents with signatures
      const recentActivity = await Document.findAll({
        where: { user_id: req.userId },
        include: [
          {
            model: Signature,
            as: 'signatures',
          },
        ],
        order: [['updated_at', 'DESC']],
        limit: Number(limit),
        offset: Number(offset),
      });

      res.status(200).json({
        activity: recentActivity.map((doc) => ({
          type: doc.status === 'signed' ? 'signed' : 'uploaded',
          document: doc.toSafeJSON(),
          signatures: doc.signatures?.map((s) => s.toSafeJSON()) || [],
          timestamp: doc.updated_at,
        })),
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error: any) {
      console.error('Get activity error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get activity',
      });
    }
  }
}

// Export singleton instance
export const usersController = new UsersController();
