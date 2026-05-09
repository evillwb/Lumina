import React from "react";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
}) => {
  return (
    <div className="markdown-body prose prose-slate dark:prose-invert max-w-none">
      <Markdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code(props: any) {
            const { children, className, node, ...rest } = props;
            const match = /language-(\w+)/.exec(className || "");
            return match ? (
              <pre className="bg-[#1e1e1e] text-indigo-200 p-4 rounded-xl overflow-x-auto text-sm border border-neutral-800 shadow-md">
                <code className={className} {...rest}>
                  {children}
                </code>
              </pre>
            ) : (
              <code
                className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-mono text-sm"
                {...rest}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
};
