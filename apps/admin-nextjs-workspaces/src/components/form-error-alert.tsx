import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** The destructive block every form shows above itself on submit error — one bullet per message. */
export function FormErrorAlert({ messages }: { messages: string[] | null }) {
  if (!messages || messages.length === 0) return null;
  return (
    <Alert variant="destructive">
      <AlertCircleIcon className="size-4" />
      <AlertTitle>{messages.length === 1 ? "Something went wrong" : "Please fix the following"}</AlertTitle>
      <AlertDescription>
        {messages.length === 1 ? (
          messages[0]
        ) : (
          <ul className="list-disc pl-4">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
