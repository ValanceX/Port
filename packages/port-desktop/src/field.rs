//! The text field's rule for the engine's late answers.

/// One text field: what the engine last said it holds, what the person sees and has typed, and what was reported that the engine has not yet answered. The engine owns the value, but it answers a
/// keystroke after the next one may have been typed; taking its answer at face value would delete the keystroke that came in between.
#[derive(Debug, Clone, PartialEq)]
pub struct Field {
    pub shown: String,
    pub buffer: String,
    pending: Vec<String>,
}

impl Field {
    pub fn new(value: &str) -> Field {
        Field {
            shown: value.to_owned(),
            buffer: value.to_owned(),
            pending: Vec::new(),
        }
    }

    /// The engine says the field's value is `value`. An answer to something typed leaves the buffer alone (the person may be ahead of it); a value that is not an answer, because the engine changed
    /// it (a save, a discard, a clear), replaces what was typed.
    pub fn incoming(&mut self, value: &str) {
        if value == self.shown {
            return;
        }

        self.shown = value.to_owned();

        match self.pending.iter().position(|sent| sent == value) {
            Some(at) => {
                self.pending.drain(..=at);
            }
            None => {
                self.pending.clear();
                self.buffer = value.to_owned();
            }
        }
    }

    /// The person changed the buffer: this is what to report.
    pub fn typed(&mut self) -> String {
        self.pending.push(self.buffer.clone());
        self.buffer.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::Field;

    #[test]
    fn a_stale_answer_does_not_delete_what_was_typed_after() {
        let mut field = Field::new("");

        field.buffer = "G".into();
        assert_eq!(field.typed(), "G");
        field.buffer = "Gr".into();
        assert_eq!(field.typed(), "Gr");

        field.incoming("G"); // the answer to the first keystroke, after the second was typed
        assert_eq!(field.buffer, "Gr");
        field.incoming("Gr");
        assert_eq!(field.buffer, "Gr");
    }

    #[test]
    fn a_value_the_engine_changed_replaces_what_was_typed() {
        let mut field = Field::new("Milk");

        field.buffer = "Oat milk".into();
        field.typed();
        field.incoming("Oat milk");
        field.incoming("Milk"); // a discard
        assert_eq!(field.buffer, "Milk");

        field.incoming(""); // cleared after an add
        assert_eq!(field.buffer, "");
    }

    #[test]
    fn skipped_answers_are_tolerated() {
        let mut field = Field::new("");

        for text in ["a", "ab", "abc"] {
            field.buffer = text.into();
            field.typed();
        }

        field.incoming("abc"); // the engine skipped the first two
        assert_eq!(field.buffer, "abc");
        field.incoming("");
        assert_eq!(field.buffer, "");
    }
}
