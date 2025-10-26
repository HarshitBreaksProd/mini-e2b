import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../lib/api";
import type { Sandbox } from "../types";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Plus, Trash2, Terminal } from "lucide-react";

export default function SandboxList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch sandboxes
  const {
    data: sandboxesData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["sandboxes"],
    queryFn: () => apiClient.getSandboxes(),
  });

  // Create sandbox mutation
  const createSandboxMutation = useMutation({
    mutationFn: () => apiClient.createSandbox(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandboxes"] });
    },
  });

  // Delete sandbox mutation
  const deleteSandboxMutation = useMutation({
    mutationFn: (sandboxId: string) => apiClient.deleteSandbox(sandboxId),
    onSuccess: () => {
      // Invalidate all sandbox-related queries
      queryClient.invalidateQueries({ queryKey: ["sandboxes"] });
      queryClient.invalidateQueries({ queryKey: ["sandbox"] });
    },
  });

  const handleCreateSandbox = () => {
    createSandboxMutation.mutate();
  };

  const handleDeleteSandbox = (sandboxId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this sandbox?")) {
      deleteSandboxMutation.mutate(sandboxId);
    }
  };

  const handleSandboxClick = (sandboxId: string) => {
    navigate(`/sandbox/${sandboxId}`);
  };

  const sandboxes = sandboxesData?.sandboxes || [];

  if (isLoading) {
    return (
      <div className="min-h-screen w-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading sandboxes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load sandboxes</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Sandboxes</h1>
          <Button
            onClick={handleCreateSandbox}
            disabled={createSandboxMutation.isPending}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {createSandboxMutation.isPending ? "Creating..." : "Add Sandbox"}
          </Button>
        </div>

        {/* Sandboxes Grid */}
        {sandboxes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-center">
              <Terminal className="h-24 w-24 text-gray-400 mx-auto mb-6" />
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                No sandboxes yet
              </h2>
              <p className="text-gray-600 mb-8">
                Create your first sandbox to get started with interactive
                development
              </p>
              <Button
                onClick={handleCreateSandbox}
                disabled={createSandboxMutation.isPending}
                size="lg"
                className="flex items-center gap-2"
              >
                <Plus className="h-5 w-5" />
                {createSandboxMutation.isPending
                  ? "Creating..."
                  : "Create Your First Sandbox"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sandboxes.map((sandbox: Sandbox) => (
              <Card
                key={sandbox.id}
                className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white"
                onClick={() => handleSandboxClick(sandbox.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-medium text-gray-900 truncate">
                      {sandbox.id.slice(0, 8)}...
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDeleteSandbox(sandbox.id, e)}
                      disabled={deleteSandboxMutation.isPending}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <CardDescription className="text-sm text-gray-500">
                    Container: {sandbox.containerId.slice(0, 12)}...
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        sandbox.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {sandbox.status}
                    </span>
                    <span className="text-gray-500">
                      {new Date(sandbox.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
