import { AlertCircleIcon } from "lucide-react";

/** The destructive block every form shows above itself on submit error — one bullet per message. */
export function FormErrorAlert({ messages }: { messages: string[] | null }) {
  if (!messages || messages.length === 0) return null;
  return (
    <div role="alert" className="mb-4 flex gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">{messages.length === 1 ? "Something went wrong" : "Please fix the following"}</p>
        {messages.length === 1 ? (
          <p className="mt-1">{messages[0]}</p>
        ) : (
          <ul className="mt-1 list-disc pl-4">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
