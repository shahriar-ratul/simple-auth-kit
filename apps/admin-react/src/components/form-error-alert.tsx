import { AlertCircleIcon } from "lucide-react";

/** The destructive block every form shows above itself on submit error — one bullet per message. */
export function FormErrorAlert({ messages }: { messages: string[] | null }) {
  if (!messages || messages.length === 0) return null;
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{messages.length === 1 ? "Something went wrong" : "Please fix the following"}</p>
        {messages.length === 1 ? (
          <p>{messages[0]}</p>
        ) : (
          <ul className="list-disc pl-4">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
