// src/routes/userRoutes.js
import express from 'express';
import { supabase } from '../config/database.js';
import { GeminiService } from '../services/geminiService.js';
import multer from 'multer';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const upload = multer({ dest: 'uploads/' });

const router = express.Router();
const MAX_API_CALLS = process.env.MAX_API_CALLS || 30;

// Get user details (without exposing Gemini API key)
router.get('/user/:userKey', async (req, res) => {
    try {
        const { userKey } = req.params;

        if (!userKey.startsWith('TEST')) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Fetch user from Supabase
        const { data: user, error } = await supabase
            .from('test_users')
            .select('name, email, user_key, calls_made, max_calls')
            .eq('user_key', userKey)
            .single();

        if (error) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user has exceeded call limit
        const callsRemaining = (user.max_calls || MAX_API_CALLS) - (user.calls_made || 0);
        const canMakeCall = callsRemaining > 0;

        res.json({
            name: user.name,
            email: user.email,
            userKey: user.user_key,
            callsMade: user.calls_made || 0,
            maxCalls: user.max_calls || MAX_API_CALLS,
            callsRemaining,
            canMakeCall
        });

    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/user/check-key', async (req, res) => {
    try {
        const { userKey, returnApiKey = false } = req.body;

        if (!userKey) {
            return res.status(400).json({ error: 'User key is required' });
        }

        if (!userKey.startsWith('TEST')) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        console.log('Searching for user key:', userKey); // Debug log

        // Fetch user from Supabase
        const { data: user, error } = await supabase
            .from('test_users')
            .select('user_key, gemini_api_key')
            .eq('user_key', userKey)
            .single();

        // Add detailed error logging
        if (error) {
            console.log('Supabase error details:', error);
            console.log('Error code:', error.code);
            console.log('Error message:', error.message);
        }

        console.log('Query result - data:', user);
        console.log('Query result - error:', error);

        if (error || !user) {
            console.log('User not found:', userKey);
            return res.json({
                exists: false,
                ...(returnApiKey && { apiKey: null })
            });
        }

        console.log('User found:', user);

        // Return response based on returnApiKey boolean
        if (returnApiKey) {
            res.json({
                exists: true,
                apiKey: null
            });
        } else {
            res.json({ exists: true });
        }

    } catch (error) {
        console.error('Error checking user key:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/user/:userKey/gemini-call', upload.single('image'), async (req, res) => {
    try {
        const { userKey } = req.params;
        const { prompt, systemInstruction } = req.body;
        const imageFile = req.file;

        // Validate input
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        if (!userKey.startsWith('TEST')) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // User validation and quota check (your existing code)
        const { data: user, error: fetchError } = await supabase
            .from('test_users')
            .select('name, email, gemini_api_key, calls_made, max_calls')
            .eq('user_key', userKey)
            .single();

        if (fetchError) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check call limits (your existing code)
        const currentCalls = user.calls_made || 0;
        const maxCalls = user.max_calls || MAX_API_CALLS;
        if (currentCalls >= maxCalls) {
            return res.status(429).json({
                error: 'API call limit exceeded',
                callsMade: currentCalls,
                maxCalls: maxCalls
            });
        }

        // Process the request
        const geminiService = new GeminiService(user.gemini_api_key);
        let result;

        if (imageFile) {
            try {
                // Process image
                const uploadedImage = await geminiService.uploadImage(imageFile.path);
                result = await geminiService.generateMultimodalContent(
                    prompt,
                    uploadedImage.uri,
                    imageFile.mimetype,
                    systemInstruction
                );
            }
            catch (error) {
                console.error('Error processing image:', error);
                return res.status(415).json({ error: 'Failed to upload image to Gemini' });
            } finally {
                // Clean up temp file safely
                if (imageFile?.path) {
                    try {
                        fs.unlinkSync(imageFile.path);
                    } catch (cleanupError) {
                        console.error('Error cleaning up file:', cleanupError);
                    }
                }
            }
        } else {
            return res.status(415).json({ error: 'Failed to upload image to Gemini' });
        }

        // Update call count (your existing code)
        const { error: updateError } = await supabase
            .from('test_users')
            .update({ calls_made: currentCalls + 1 })
            .eq('user_key', userKey);

        if (updateError) {
            console.error('Error updating call count:', updateError);
        }

        // Return response
        res.json({
            success: true,
            response: result,
            callsMade: currentCalls + 1,
            callsRemaining: maxCalls - (currentCalls + 1)
        });

    } catch (error) {
        console.error('Error in gemini-call:', error);

        // Clean up temp file if something failed
        if (req.file?.path) {
            fs.unlinkSync(req.file.path).catch(() => { });
        }

        // Error handling (your existing code)
        if (error.message.includes('API key')) {
            res.status(401).json({ error: 'Invalid API key configuration' });
        } else if (error.message.includes('quota')) {
            res.status(429).json({ error: 'Gemini API quota exceeded' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Reset user's call count (admin only)
router.post('/admin/user/:userKey/reset', async (req, res) => {
    try {
        const { userKey } = req.params;
        const { adminKey } = req.body;

        if (!userKey.startsWith('TEST')) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        if (!adminKey) {
            return res.status(400).json({ error: 'Admin key is required' });
        }

        // Simple admin authentication (use proper auth in production)
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { error } = await supabase
            .from('test_users')
            .update({ calls_made: 0 })
            .eq('user_key', userKey);

        if (error) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, message: 'Call count reset' });

    } catch (error) {
        console.error('Error resetting calls:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;