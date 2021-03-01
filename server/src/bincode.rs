use bincode::{DefaultOptions, Options, Result};

/// Gets our custom options.
fn custom_options() -> DefaultOptions {
    DefaultOptions::new()
}

/// Deserializes a slice of bytes into an instance of `T` using the custom configuration.
pub fn deserialize<'a, T>(bytes: &'a [u8]) -> Result<T>
where
    T: serde::de::Deserialize<'a>,
{
    custom_options().deserialize(bytes)
}

/// Serializes a serializable object into a `Vec` of bytes using the custom configuration.
pub fn serialize<T: ?Sized>(value: &T) -> Result<Vec<u8>>
where
    T: serde::Serialize,
{
    custom_options().serialize(value)
}
