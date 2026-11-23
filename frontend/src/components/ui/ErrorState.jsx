import StatusAlert from "../StatusAlert";

export default function ErrorState({
  title = "Unable to load data",
  message = "An unexpected error occurred.",
  onRetry,
  retryLabel = "Retry",
}) {
  return (
    <div className="p-3">
      <StatusAlert
        variant="danger"
        title={title}
        message={message}
        onRetry={onRetry}
        retryLabel={retryLabel}
      />
    </div>
  );
}
