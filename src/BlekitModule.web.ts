import { registerWebModule, NativeModule } from 'expo';

import { BlekitModuleEvents } from './BlekitModule';

// BlekitModule is not available on the web platform.
class BlekitModule extends NativeModule<BlekitModuleEvents> {}

export default registerWebModule(BlekitModule, 'BlekitModule');
