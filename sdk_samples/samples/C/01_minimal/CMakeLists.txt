project(c_sample_01_minimal)

add_executable(${PROJECT_NAME} 01_minimal.c)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
