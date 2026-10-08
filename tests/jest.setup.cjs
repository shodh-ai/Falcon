const { resetExternalMocks } = require('./mocks/external-services');

afterEach(() => {
  resetExternalMocks();
});
