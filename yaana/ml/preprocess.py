import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin


class ColumnOrderTransformer(BaseEstimator, TransformerMixin):
    """Select model columns in a fixed order. It learns no statistics."""

    def __init__(self, columns):
        self.columns = columns

    def fit(self, X, y=None):
        frame = self._frame(X)
        missing = [column for column in self.columns if column not in frame.columns]
        if missing:
            raise ValueError(f"Missing features: {', '.join(missing)}")
        self.n_features_in_ = len(self.columns)
        self.feature_names_in_ = np.array(self.columns, dtype=object)
        return self

    def transform(self, X):
        frame = self._frame(X)
        return frame.loc[:, self.columns].to_numpy(dtype=float)

    def _frame(self, X):
        if isinstance(X, pd.DataFrame):
            return X
        if isinstance(X, dict):
            return pd.DataFrame([X])
        array = np.asarray(X, dtype=float)
        if array.ndim == 1:
            array = array.reshape(1, -1)
        return pd.DataFrame(array, columns=self.columns)
