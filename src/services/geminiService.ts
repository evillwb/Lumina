import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export interface QuizQuestionData {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export const generateQuizQuestions = async (
  subject: string, 
  topic: string, 
  notes?: string, 
  language: string = 'English', 
  files?: { mimeType: string, data: string }[],
  numQuestions: number = 1
): Promise<QuizQuestionData[]> => {
  const prompt = `
    You are an expert tutor in ${subject}. 
    I am a student preparing for an exam.
    Please generate ${numQuestions} multiple-choice question(s) to test my understanding of the topic: "${topic}".
    ${notes ? `Here are my notes on this topic, try to align the questions with these concepts: "${notes}"` : ''}

    CRITICAL: The entire questions, options, and explanations MUST be in the following language: ${language}.
    If there are any attached files/images, use them as extra context for generating the questions.

    Return the response ONLY as a JSON string representing an array of objects. Do not include markdown code block formatting or backticks.
    Format:
    [
      {
        "question": "The question text (in ${language})",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswer": "Option A",
        "explanation": "A short explanation of why the correct answer is correct and others might be incorrect (in ${language})"
      }
    ]
  `;

  try {
    const contents: any[] = [{ text: prompt }];

    if (files && files.length > 0) {
       for (const f of files) {
          contents.push({
             inlineData: {
                data: f.data,
                mimeType: f.mimeType
             }
          });
       }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No text returned from Gemini");
    
    // Sometimes the AI returns just one object instead of an array if numQuestions=1.
    const parsed = JSON.parse(resultText);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.error("Error generating question with Gemini:", error);
    // Fallback question
    return [{
      question: `What is the core concept of ${topic}?`,
      options: [
        `It's a fundamental part of ${subject}.`,
        "It is irrelevant.",
        "It's only theoretical.",
        "None of the above."
      ],
      correctAnswer: `It's a fundamental part of ${subject}.`,
      explanation: `This is a fallback question because the AI failed to generate one.`
    }];
  }
};

export interface DynamicQuizData {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
}

export const generateDynamicQuiz = async (topic: string, language: string = 'English'): Promise<DynamicQuizData> => {
  const prompt = `You are an expert tutor. Generate one unique, challenging multiple-choice question about the topic: ${topic}. Return ONLY a valid JSON object with this exact structure, with no markdown formatting or extra text: {"question": "string", "options": ["string", "string", "string", "string"], "correctIndex": number (0-3)}. The question and options must be translated to: ${language}.`;

  const fallback: DynamicQuizData = {
    question: "What is the primary indicator of knowledge mastery?",
    options: ["Rote memorization", "Passive reading", "Active recall and application", "Ignoring feedback"],
    correctIndex: 2
  };

  try {
    const fetchPromise = ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ text: prompt }],
      config: {
        responseMimeType: 'application/json',
      }
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('API Timeout')), 5000);
    });

    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    // Type assertion since `response` from Promise.race is inferred as `GenerateContentResponse | never`
    const { text } = (response as any);
    if (!text) throw new Error("No text returned from Gemini");

    const parsed = JSON.parse(text);
    
    if (
      typeof parsed.question === 'string' &&
      Array.isArray(parsed.options) &&
      parsed.options.length === 4 &&
      typeof parsed.correctIndex === 'number' &&
      parsed.correctIndex >= 0 &&
      parsed.correctIndex <= 3
    ) {
      return parsed as DynamicQuizData;
    } else {
      throw new Error("Malformed JSON structure");
    }
  } catch (error) {
    console.error("Error generating dynamic quiz:", error);
    return fallback; // Return hardcoded fallback question silently
  }
};
