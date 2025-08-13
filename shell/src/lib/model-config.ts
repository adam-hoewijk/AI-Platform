import { usePersistentState } from "./persist";

export interface ModelConfig {
  reasoning: {
    effort: "minimal" | "low" | "medium" | "high";
  };
  text: {
    verbosity: "low" | "medium" | "high";
  };
  [key: string]: string | number | boolean | null | undefined | ModelConfig[keyof ModelConfig];
}

export const defaultModelConfig: ModelConfig = {
  reasoning: {
    effort: "minimal",
  },
  text: {
    verbosity: "low",
  },
};

export function useModelConfig() {
  return usePersistentState<ModelConfig>("modelConfig", defaultModelConfig, {
    namespace: "settings",
    version: 1,
  });
}

export function getModelConfigParams(config: ModelConfig) {
  return {
    reasoning: {
      effort: config.reasoning.effort,
    },
    text: {
      verbosity: config.text.verbosity,
    },
  };
}
