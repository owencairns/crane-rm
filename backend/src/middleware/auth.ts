import { Request, Response, NextFunction } from 'express';
import { auth } from '../services/firebase.service';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    uid: string;
    email?: string;
  };
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: No token provided' });
      return;
    }

    const token = authHeader.substring(7);

    // Verify Firebase Auth token
    const decodedToken = await auth.verifyIdToken(token);

    // Attach user info to request
    req.userId = decodedToken.uid;
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}
