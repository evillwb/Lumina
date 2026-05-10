import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export interface QuizQuestionData {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (innerE) {}
    }
    
    // Look for first { or [ and last } or ]
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    
    // Determine bounds for array or object
    const startObj = firstBrace !== -1 ? firstBrace : Infinity;
    const endObj = lastBrace !== -1 ? lastBrace : -1;
    
    const startArr = firstBracket !== -1 ? firstBracket : Infinity;
    const endArr = lastBracket !== -1 ? lastBracket : -1;
    
    let startIndex = -1;
    let endIndex = -1;
    
    if (startArr < startObj && endArr > startArr) {
      startIndex = startArr;
      endIndex = endArr + 1;
    } else if (startObj < startArr && endObj > startObj) {
      startIndex = startObj;
      endIndex = endObj + 1;
    }
    
    if (startIndex !== -1 && endIndex !== -1) {
      return JSON.parse(text.substring(startIndex, endIndex));
    }

    throw e;
  }
}

export const generateQuizQuestions = async (
  subject: string,
  topic: string,
  notes?: string,
  language: string = "English",
  files?: { mimeType: string; data: string }[],
  numQuestions: number = 1,
): Promise<QuizQuestionData[]> => {
  const prompt = `
    You are an expert tutor in ${subject}. 
    I am a student preparing for an exam.
    Please generate ${numQuestions} multiple-choice question(s) to test my understanding of the topic: "${topic}".
    
    ${notes && notes.trim().length > 0 ? `Here are my notes on this topic:\n"""\n${notes}\n"""` : ""}
    ${files && files.length > 0 ? "I have also attached some reference materials (documents or images)." : ""}
    
    ${
      (notes && notes.trim().length > 0) || (files && files.length > 0)
        ? `CRITICAL CONTEXT INSTRUCTION:
    You MUST derive the questions, correct answers, and explanations directly and accurately from the notes and attached reference materials provided. 
    Do not generate generic questions about the topic; strictly test my knowledge on the specific details, definitions, and concepts present in the provided materials. If the materials are insufficient for ${numQuestions} questions, do your best to extrapolate highly related questions.`
        : ""
    }

    GENERAL INSTRUCTIONS:
    1. The entire questions, options, and explanations MUST be in the following language: ${language}.
    2. Make the questions challenging but fair.
    3. Ensure the correct answer is unambiguously correct based on the provided material, and the distractors (wrong options) are plausible.
    4. Provide clear explanations for WHY the correct answer is right and the others are wrong, referencing the material where possible.

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
            mimeType: f.mimeType,
          },
        });
      }
    }

    const response = await getAIClient().models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
      },
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No text returned from Gemini");

    // Sometimes the AI returns just one object instead of an array if numQuestions=1.
    const parsed = extractJson(resultText);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.error("Error generating question with Gemini:", error);
    // Fallback question
    return [
      {
        question: `What is the core concept of ${topic}?`,
        options: [
          `It's a fundamental part of ${subject}.`,
          "It is irrelevant.",
          "It's only theoretical.",
          "None of the above.",
        ],
        correctAnswer: `It's a fundamental part of ${subject}.`,
        explanation: `This is a fallback question because the AI failed to generate one.`,
      },
    ];
  }
};

export const summarizeStudyNotes = async (
  rawText: string,
  files?: { mimeType: string; data: string }[],
): Promise<{ summaryBulletPoints: string[]; keyTerms: string[] }> => {
  const prompt = `You are an expert tutor. Summarize the following study notes. Return ONLY a valid JSON object with this exact structure: {"summaryBulletPoints": ["string", "string", "string"], "keyTerms": ["string", "string", "string"]}. Here are the notes: ${rawText}`;

  try {
    const contents: any[] = [{ text: prompt }];

    if (files && files.length > 0) {
      for (const f of files) {
        contents.push({
          inlineData: {
            data: f.data,
            mimeType: f.mimeType,
          },
        });
      }
    }

    const response = await getAIClient().models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
      },
    });

    const { text } = response as any;
    if (!text) throw new Error("No text returned from Gemini");

    const parsed = extractJson(text);
    if (
      Array.isArray(parsed.summaryBulletPoints) &&
      Array.isArray(parsed.keyTerms)
    ) {
      return parsed;
    } else {
      throw new Error("Malformed JSON structure");
    }
  } catch (error) {
    console.error("Error summarizing study notes:", error);
    return {
      summaryBulletPoints: ["Could not summarize notes."],
      keyTerms: ["Error"],
    };
  }
};

export const answerFollowUpQuestion = async (
  question: string,
  rawText: string,
  summaryText: string,
  files?: { mimeType: string; data: string }[],
): Promise<string> => {
  const prompt = `You are an expert tutor. Answer the student's follow-up question based on the original notes and the summary provided below. 

Original Notes:
${rawText}

Summary:
${summaryText}

Student's Question:
${question}

Answer concisely, helpfully, and directly.`;

  try {
    const contents: any[] = [{ text: prompt }];

    if (files && files.length > 0) {
      for (const f of files) {
        contents.push({
          inlineData: {
            data: f.data,
            mimeType: f.mimeType,
          },
        });
      }
    }

    const response = await getAIClient().models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
    });

    return (
      (response as any).text || "I'm sorry, I couldn't generate an answer."
    );
  } catch (error) {
    console.error("Error answering follow up question:", error);
    return "An error occurred while answering your question.";
  }
};

export const generateTopicImage = async (
  promptText: string,
): Promise<string> => {
  try {
    const response = await getAIClient().models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          {
            text: `Create an educational, clean, abstract visual representation of the following topic concept: ${promptText}. Do not include any text in the image.`,
          },
        ],
      },
    });

    for (const part of (response as any).candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image part found in response");
  } catch (error) {
    console.error("Error generating topic image:", error);
    throw error;
  }
};

export interface LessonPlanData {
  learningObjectives: string[];
  keyActivities: string[];
  assessmentMethods: string[];
}

export interface DynamicQuizData {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
}

export const generateLessonPlan = async (
  topicName: string,
  difficultyLevel: number,
  priority: string,
): Promise<LessonPlanData> => {
  const prompt = `You are an expert curriculum designer. Please generate a concise lesson plan for the topic: "${topicName}". 
  The student's difficulty level is ${difficultyLevel}/10. Priority is ${priority}.
  
  Return ONLY a valid JSON object with this exact structure, with no markdown formatting or extra text: 
  { 
    "learningObjectives": ["string", "string"], 
    "keyActivities": ["string", "string"], 
    "assessmentMethods": ["string", "string"] 
  }`;

  try {
    const fetchPromise = getAIClient().models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("API Timeout - Gemini took longer than 10 seconds")), 10000);
    });

    const response = await Promise.race([fetchPromise, timeoutPromise]);

    const { text } = response as any;
    if (!text) throw new Error("No text returned from Gemini");

    const parsed = extractJson(text);

    if (
      Array.isArray(parsed.learningObjectives) &&
      Array.isArray(parsed.keyActivities) &&
      Array.isArray(parsed.assessmentMethods)
    ) {
      return parsed as LessonPlanData;
    } else {
      throw new Error("Malformed JSON structure for lesson plan");
    }
  } catch (error) {
    console.error("Error generating lesson plan:", error);
    alert("Failed to generate lesson plan. Please check your connection or try again later.");
    throw error;
  }
};


export const generateDynamicQuiz = async (
  topic: string,
  language: string = "English",
  notes?: string,
  files?: { mimeType: string; data: string }[],
): Promise<DynamicQuizData> => {
  const prompt = `You are an expert tutor. Generate one unique, challenging multiple-choice question about the topic: ${topic}. 
  
  ${notes && notes.trim().length > 0 ? `Here are the student's personal notes on this topic:\n"""\n${notes}\n"""` : ""}
  ${files && files.length > 0 ? "Reference materials are also attached." : ""}
  
  ${(notes && notes.trim().length > 0) || (files && files.length > 0) ? `CRITICAL: You MUST draw the question and correct answer directly from the notes and reference materials provided. Test specific facts or concepts mentioned there.` : ""}
  
  Return ONLY a valid JSON object with this exact structure, with no markdown formatting or extra text: {"question": "string", "options": ["string", "string", "string", "string"], "correctIndex": number (0-3)}. The question and options must be translated to: ${language}.`;

  const fallback: DynamicQuizData = {
    question: "What is the primary indicator of knowledge mastery?",
    options: [
      "Rote memorization",
      "Passive reading",
      "Active recall and application",
      "Ignoring feedback",
    ],
    correctIndex: 2,
  };

  try {
    const contents: any[] = [{ text: prompt }];

    if (files && files.length > 0) {
      for (const f of files) {
        contents.push({
          inlineData: {
            data: f.data,
            mimeType: f.mimeType,
          },
        });
      }
    }

    const fetchPromise = getAIClient().models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("API Timeout")), 5000);
    });

    const response = await Promise.race([fetchPromise, timeoutPromise]);

    // Type assertion since `response` from Promise.race is inferred as `GenerateContentResponse | never`
    const { text } = response as any;
    if (!text) throw new Error("No text returned from Gemini");

    const parsed = extractJson(text);

    if (
      typeof parsed.question === "string" &&
      Array.isArray(parsed.options) &&
      parsed.options.length === 4 &&
      typeof parsed.correctIndex === "number" &&
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
