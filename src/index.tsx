#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import App from './components/App.js';
import { loadConfig } from './config.js';

const config = loadConfig();

render(<App initialConfig={config} />);
