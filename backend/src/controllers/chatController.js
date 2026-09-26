import ChatMessage from '../models/ChatMessage.js';
import { routeQuery } from '../services/query/queryRouter.js';
import { analyzeQuery } from '../services/query/queryAnalyzer.js';
import { classifyIntent } from '../services/query/intentClassifier.js';
import { answerQuestion } from '../services/rag/ragService.js';
import { retrieveHybridContext } from '../services/retrieval/hybridRetriever.js';

/**
 * @desc    Submit user inquiry and receive grounded answer via Intelligent Query Router (Phase 6)
 * @route   POST /api/chat
 * @access  Private (Authenticated users)
 */
export const sendMessage = async (req, res, next) => {
  try {
    const { message, options } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a non-empty message for the campus assistant.',
      });
    }

    const trimmedQuery = message.trim();

    // 1. Run Phase 6 Intelligent Query Routing pipeline (Clarification, Structured, Document Search, Hybrid, or RAG)
    const routeResult = await routeQuery(trimmedQuery, req.user, options || {});

    // 2. Persist single-question conversation in MongoDB
    try {
      // User message
      await ChatMessage.create({
        userId: req.user._id,
        role: 'user',
        content: trimmedQuery,
        sources: [],
      });

      // Assistant message
      await ChatMessage.create({
        userId: req.user._id,
        role: 'assistant',
        content: routeResult.answer,
        sources: routeResult.sources || [],
      });
    } catch (dbErr) {
      console.warn(`[Chat History Warning] Failed to log chat message: ${dbErr.message}`);
    }

    // 3. Return grounded answer, citations, structured payload, and routing metadata
    return res.status(200).json({
      success: true,
      message: 'Assistant response generated successfully.',
      data: {
        answer: routeResult.answer,
        queryType: routeResult.queryType || 'rag',
        intent: routeResult.intent || 'policy_question',
        coverage: routeResult.coverage || 'FULL',
        requestedFields: routeResult.requestedFields || [],
        supportedFields: routeResult.supportedFields || [],
        missingFields: routeResult.missingFields || [],
        sources: routeResult.sources || [],
        structuredData: routeResult.structuredData || null,
        clarification: routeResult.clarification || null,
        retrieval: routeResult.retrieval || { strategy: 'routed', cached: false },
        cache: routeResult.cache || { hit: false, type: 'miss' },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's recent chat dialogue history
 * @route   GET /api/chat/history
 * @access  Private (Authenticated users)
 */
export const getChatHistory = async (req, res, next) => {
  try {
    const messages = await ChatMessage.find({ userId: req.user._id })
      .sort({ createdAt: 1 })
      .limit(50);

    return res.status(200).json({
      success: true,
      message: 'Chat history retrieved.',
      data: {
        messages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Development & Admin-only retrieval diagnostics endpoint
 * @route   POST /api/chat/debug
 * @access  Private (Admin or Development environment only)
 */
export const debugRetrieval = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production' && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Retrieval diagnostics endpoint is restricted.',
      });
    }

    const { message, options } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a message to evaluate.',
      });
    }

    const queryText = message.trim();
    const analysis = analyzeQuery(queryText);
    const classification = classifyIntent(analysis);
    const result = await retrieveHybridContext(queryText, options || {});

    return res.status(200).json({
      success: true,
      message: 'Retrieval diagnostics completed.',
      data: {
        routing: {
          intent: classification.intent,
          queryType: classification.queryType,
          confidence: classification.confidence,
          clarification: classification.clarification,
          analysis,
        },
        diagnostics: result.diagnostics,
        chunks: result.chunks.map((c) => ({
          documentTitle: c.documentTitle,
          pageNumber: c.pageNumber,
          chunkIndex: c.chunkIndex,
          score: Math.round((c.rerankScore || c.rrfScore || c.score || 0) * 1000) / 1000,
          vectorRank: c.vectorRank,
          keywordRank: c.keywordRank,
          sourcesFoundIn: c.sourcesFoundIn,
          snippet: c.text.slice(0, 250),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  sendMessage,
  getChatHistory,
  debugRetrieval,
};
