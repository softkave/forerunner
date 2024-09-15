import {AnyAsyncFn, AnyObject} from 'softkave-js-utils';

export interface IFimidaraCmdOptionDef {
  shortName: string;
  longName: string;
  type: string;
  isRequired: boolean;
  description?: string;
  choices?: string[];
  defaultValue?: unknown;
}

export interface IFimidaraCmdDef<TOptions extends AnyObject = AnyObject> {
  cmd: string;
  description: string;
  options: IFimidaraCmdOptionDef[];
  action: AnyAsyncFn<[TOptions]>;
}
