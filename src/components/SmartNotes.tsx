import React, { useState, useRef, useEffect } from "react";
import {
  summarizeStudyNotes,
  answerFollowUpQuestion,
  generateTopicImage,
} from "../services/geminiService";
import {
  Sparkles,
  Loader2,
  FileText,
  Tag,
  List,
  Upload,
  X,
  Save,
  Image as ImageIcon,
  MessageSquare,
  Send,
  User,
} from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { useTranslation } from "../locales/i18n";
import { useAuth } from "../contexts/AuthContext";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";

export const SmartNotes: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [inputText, setInputText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [results, setResults] = useState<{
    summaryBulletPoints: string[];
    keyTerms: string[];
  } | null>(null);

  // Follow Up Q&A
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    { role: "user" | "ai"; text: string; timestamp: Date }[]
  >([]);

  // State for image generation
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Keep track of loaded file data to reuse for follow ups
  const [processedFilesState, setProcessedFilesState] = useState<
    { mimeType: string; data: string }[]
  >([]);
  const [savedInputText, setSavedInputText] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory]);

  const handleSummarize = async () => {
    if (!inputText.trim() && files.length === 0) return;
    
    // Prevent huge text from crashing the API and eating budget
    if (inputText.length > 50000) {
      alert("Input text is too long. Please summarize it in smaller chunks.");
      return;
    }

    setIsSummarizing(true);
    setResults(null);
    setGeneratedImage(null);
    setChatHistory([]);
    setSavedInputText(inputText);

    try {
      const processedFiles: { mimeType: string; data: string }[] = [];
      for (const file of files) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () =>
            resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        processedFiles.push({ mimeType: file.type, data: base64 });
      }
      setProcessedFilesState(processedFiles);

      const result = await summarizeStudyNotes(inputText, processedFiles);
      setResults(result);
      setFiles([]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSummarizing(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuickQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !results) return;

    const userQ = question;
    setQuestion("");
    setChatHistory((prev) => [
      ...prev,
      { role: "user", text: userQ, timestamp: new Date() },
    ]);
    setIsAsking(true);

    try {
      const summaryText =
        results.summaryBulletPoints.join("\n") +
        "\nTerms: " +
        results.keyTerms.join(", ");
      const answer = await answerFollowUpQuestion(
        userQ,
        savedInputText,
        summaryText,
        processedFilesState,
      );
      setChatHistory((prev) => [
        ...prev,
        { role: "ai", text: answer, timestamp: new Date() },
      ]);
    } catch (error) {
      console.error(error);
      setChatHistory((prev) => [
        ...prev,
        {
          role: "ai",
          text: "Sorry, I encountered an error while trying to answer that.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveToSyllabus = async () => {
    if (!user || !results || isSaving) return;
    setIsSaving(true);

    const topicId = uuidv4();
    const formattedNotes = `### Summary\n\n${(results.summaryBulletPoints || []).map((b) => `- ${b}`).join("\n")}\n\n### Key Terms\n\n${(results.keyTerms || []).join(", ")}`;

    try {
      await setDoc(doc(db, "users", user.uid, "topics", topicId), {
        id: topicId,
        userId: user.uid,
        title: "Smart Notes Topic",
        subject: "General",
        notes: formattedNotes,
        createdAt: serverTimestamp(),
        priority: "normal",
        difficulty: "Beginner",
      });
      alert("Topic saved to your syllabus successfully!");
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `users/${user.uid}/topics/${topicId}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!results) return;
    setIsGeneratingImage(true);
    try {
      const prompt = `A topic titled "Smart Notes Topic", featuring these key terms: ${results.keyTerms.join(", ")}. Clean abstract vector art, professional educational aesthetic.`;
      const url = await generateTopicImage(prompt);
      setGeneratedImage(url);
    } catch (e) {
      console.error(e);
      alert("Failed to generate visual representation.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row gap-6 p-6 md:p-8 bg-neutral-50 dark:bg-[#09090b] overflow-hidden h-full">
      {/* Left Column: Input */}
      <div className="flex-1 flex flex-col h-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
              Smart Notebook
            </h2>
            <p className="text-sm text-neutral-500">
              Paste your raw notes or upload files for an AI summary
            </p>
          </div>
        </div>
        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          <div className="flex-1 flex flex-col bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500 transition-all">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste your messy lecture notes here... (max 20,000 characters)"
              className="flex-1 w-full p-4 text-base bg-transparent resize-none focus:outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
              disabled={isSummarizing}
              maxLength={20000}
            />
            {files.length > 0 && (
              <div className="px-4 pb-2 flex gap-2 flex-wrap">
                {files.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 bg-neutral-200 dark:bg-neutral-800 px-3 py-1.5 rounded-lg text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    <span className="truncate max-w-[150px] font-medium">
                      {f.name}
                    </span>
                    <button
                      onClick={() => removeFile(i)}
                      className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex justify-between items-center">
              <label className="cursor-pointer flex items-center justify-center p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,text/plain,image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    if (e.target.files) {
                      setFiles((prev) => [
                        ...prev,
                        ...Array.from(e.target.files!),
                      ]);
                    }
                  }}
                  disabled={isSummarizing}
                />
                <Upload className="w-5 h-5 mr-2" />
                <span className="text-sm font-medium">Attach Files</span>
              </label>
            </div>
          </div>
          <button
            onClick={handleSummarize}
            disabled={
              (!inputText.trim() && files.length === 0) || isSummarizing
            }
            className="mt-6 w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex justify-center items-center gap-2 group"
          >
            {isSummarizing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Summarizing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span>✨ AI Summarize</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right Column: Output */}
      <div className="flex-1 flex flex-col h-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden relative">
        {/* Header */}
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
              <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                Results
              </h2>
              <p className="text-sm text-neutral-500">
                Structured summary & intelligence
              </p>
            </div>
          </div>

          {!isSummarizing && results && (
            <div className="flex gap-2">
              <button
                onClick={handleGenerateImage}
                disabled={isGeneratingImage || !!generatedImage}
                className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors disabled:opacity-50"
                title="Generate Visualizer"
              >
                {isGeneratingImage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={handleSaveToSyllabus}
                disabled={isSaving}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 transition-transform active:scale-95 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}{" "}
                {isSaving ? "Saving..." : "Save Topic"}
              </button>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col space-y-10">
          {isSummarizing && (
            <div className="space-y-8 animate-pulse bg-neutral-50 dark:bg-neutral-800/20 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800/50">
              <div className="flex items-center gap-3 mb-6">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                <p className="text-neutral-500 dark:text-neutral-400 font-medium tracking-tight">
                  AI is analyzing your notes...
                </p>
              </div>
              <div className="space-y-4">
                <div className="h-6 w-1/3 bg-neutral-200 dark:bg-neutral-800 rounded-lg"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded-md w-full"></div>
                  <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded-md w-11/12"></div>
                  <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded-md w-4/5"></div>
                  <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded-md w-full"></div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="h-6 w-1/4 bg-neutral-200 dark:bg-neutral-800 rounded-lg"></div>
                <div className="flex gap-2 flex-wrap">
                  <div className="h-8 w-20 bg-neutral-200 dark:bg-neutral-800 rounded-full"></div>
                  <div className="h-8 w-24 bg-neutral-200 dark:bg-neutral-800 rounded-full"></div>
                  <div className="h-8 w-16 bg-neutral-200 dark:bg-neutral-800 rounded-full"></div>
                  <div className="h-8 w-28 bg-neutral-200 dark:bg-neutral-800 rounded-full"></div>
                </div>
              </div>
            </div>
          )}

          {!isSummarizing && results && (
            <>
              {/* Summary blocks */}
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 bg-neutral-50 dark:bg-neutral-800/20 p-6 md:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800/50">
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <List className="w-5 h-5 text-neutral-400 dark:text-neutral-500" />
                    <h3 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">
                      Summary
                    </h3>
                  </div>
                  <ul className="space-y-4">
                    {(results.summaryBulletPoints || []).map((point, index) => (
                      <li key={`summary-${index}`} className="flex gap-4">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 flex items-center justify-center text-sm font-bold mt-0.5">
                          {index + 1}
                        </span>
                        <span className="text-neutral-700 dark:text-neutral-300 leading-relaxed text-base min-w-0 flex-1 break-words whitespace-pre-wrap">
                          <MarkdownRenderer content={point} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <Tag className="w-5 h-5 text-neutral-400 dark:text-neutral-500" />
                    <h3 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">
                      Key Terms
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {(results.keyTerms || []).map((term, index) => (
                      <span
                        key={`term-${index}`}
                        className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30 rounded-xl font-medium text-sm shadow-sm"
                      >
                        {term}
                      </span>
                    ))}
                  </div>
                </div>

                {generatedImage && (
                  <div className="mt-8 animate-in fade-in duration-500">
                    <div className="flex items-center gap-2 mb-4">
                      <ImageIcon className="w-5 h-5 text-neutral-400 dark:text-neutral-500" />
                      <h3 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">
                        Visual Concept
                      </h3>
                    </div>
                    <img
                      src={generatedImage}
                      alt="Generated visual representation"
                      referrerPolicy="no-referrer"
                      className="w-full max-w-sm rounded-xl shadow-md border border-neutral-200 dark:border-neutral-800"
                    />
                  </div>
                )}
              </div>

              {/* Chat Interface */}
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 shadow-sm flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="w-5 h-5 text-indigo-500" />
                  <h3 className="font-bold text-neutral-900 dark:text-white">
                    Follow-up Questions
                  </h3>
                </div>

                <div className="space-y-4 mb-6">
                  {chatHistory.length === 0 && (
                    <p className="text-sm text-neutral-500 italic">
                      Have a question about this topic? Ask below!
                    </p>
                  )}
                  {(chatHistory || []).map((msg, idx) => (
                    <div
                      key={`chat-${idx}`}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "ai" && (
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center border border-indigo-200 dark:border-indigo-800 mr-3 mt-1">
                          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                      )}
                      <div
                        className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} max-w-[75%]`}
                      >
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm shadow-sm break-words whitespace-pre-wrap ${
                            msg.role === "user"
                              ? "bg-indigo-600 text-white rounded-tr-none"
                              : "bg-neutral-100 dark:bg-neutral-800/80 text-neutral-800 dark:text-neutral-200 rounded-tl-none leading-relaxed border border-neutral-200 dark:border-neutral-700/50"
                          }`}
                        >
                          <MarkdownRenderer content={msg.text} />
                        </div>
                        {msg.timestamp && (
                          <span className="text-[10px] text-neutral-400 mt-1.5 px-1 font-medium">
                            {msg.timestamp.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                      {msg.role === "user" && (
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center overflow-hidden border border-neutral-300 dark:border-neutral-700 ml-3 mt-1">
                          {user?.photoURL ? (
                            <img
                              src={user.photoURL}
                              alt=""
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <User className="w-4 h-4 text-neutral-500" />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {isAsking && (
                    <div className="flex justify-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center border border-indigo-200 dark:border-indigo-800 mr-3 mt-1">
                        <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/50 text-neutral-500 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2 max-w-[75%] h-[46px] shadow-sm">
                        <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce"></span>
                        <span
                          className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        ></span>
                        <span
                          className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce"
                          style={{ animationDelay: "0.4s" }}
                        ></span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form
                  onSubmit={handleQuickQuestion}
                  className="flex items-center gap-2 mt-auto relative"
                >
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about these notes..."
                    className="flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl px-4 py-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 pr-12 transition-all"
                    disabled={isAsking}
                  />
                  <button
                    type="submit"
                    disabled={!question.trim() || isAsking}
                    className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </>
          )}

          {!isSummarizing && !results && (
            <div className="h-full flex flex-col items-center justify-center text-center text-neutral-400 px-6 mt-10">
              <div className="w-20 h-20 mb-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-neutral-300 dark:text-neutral-600" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">
                Ready to Summarize
              </h3>
              <p className="text-sm max-w-[250px] leading-relaxed">
                Paste your text on the left and tap the summarize button to
                generate actionable study notes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
