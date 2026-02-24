import { Plugin } from '@nocobase/client';
import models from './models';

export class PluginNocobaseSwaggerPatchClient extends Plugin {
  async load() {
    this.flowEngine.registerModels(models);
  }
}

export default PluginNocobaseSwaggerPatchClient;
