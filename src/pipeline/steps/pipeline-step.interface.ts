import { ProcessingContext } from '../types/processing-context';

export interface IPipelineStep {
  /**
   * The name of this pipeline step for logging and metrics
   */
  readonly stepName: string;

  /**
   * Execute this pipeline step
   * @param context - The processing context that flows through all steps
   * @returns Promise<ProcessingContext> - Updated context or throws error
   */
  execute(context: ProcessingContext): Promise<ProcessingContext>;

  /**
   * Optional cleanup method called if pipeline fails after this step
   * @param context - The processing context
   */
  cleanup?(context: ProcessingContext): Promise<void>;
}
